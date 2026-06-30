import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { History, Search, ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const getNDaysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

export default function CustomerReturnHistory() {
  const [history, setHistory]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState(getNDaysAgo(30));
  const [dateTo, setDateTo]       = useState(new Date().toISOString().split('T')[0]);
  const navigate = useNavigate();

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomerReturnsHistory();
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to   = dateTo   ? new Date(dateTo + 'T23:59:59').getTime() : Infinity;
    return history.filter(row => {
      const rowDate = new Date(row.date).getTime();
      if (rowDate < from || rowDate > to) return false;
      if (!q) return true;
      return (
        (row.return_no || '').toLowerCase().includes(q) ||
        (row.original_invoice_no || '').toLowerCase().includes(q)
      );
    });
  }, [history, search, dateFrom, dateTo]);

  return (
    <div className="space-y-5 fade-in">

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <button onClick={() => navigate('/customer-returns')}
            className="text-muted hover:text-text text-xs flex items-center gap-1 mb-2 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to Returns
          </button>
          <h1 className="text-2xl font-bold text-text flex items-center gap-2">
            <History className="w-6 h-6 text-sky" /> Customer Return History
          </h1>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search by return no or invoice…"
            className="premium-input w-full pl-8 text-xs"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="premium-input text-xs" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} />
          <span className="text-muted text-xs">→</span>
          <input type="date" className="premium-input text-xs" value={dateTo}
            onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="text-xs text-muted font-medium">
          {filtered.length} of {history.length} returns
        </div>
      </div>

      {/* Table */}
      <div className="premium-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center gap-3">
            <History className="w-8 h-8 text-muted opacity-30" />
            <p className="text-sm text-muted">{history.length === 0 ? 'No returns yet.' : 'No returns match your search.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 border-b border-white/10 text-muted">
                <tr>
                  {['Return No', 'Date', 'Original Invoice', 'Items Returned', 'Refund Amount', ''].map(h => (
                    <th key={h} className="p-4 font-bold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(row => (
                  <tr key={row.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 font-mono font-bold text-text">{row.return_no}</td>
                    <td className="p-4 text-muted">
                      {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => navigate('/sells', { state: { highlightInvoice: row.original_invoice_no } })}
                        className="text-sky hover:underline flex items-center gap-1 font-mono"
                      >
                        {row.original_invoice_no}
                        <ExternalLink size={11} />
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="space-y-0.5">
                        {row.items?.map((i: any, idx: number) => (
                          <div key={idx} className="text-muted">{i.quantity}× {i.medicine_name}</div>
                        )) || <span className="text-muted">—</span>}
                      </div>
                    </td>
                    <td className="p-4 font-bold text-emerald-400">
                      ₹{Number(row.total_amount || 0).toFixed(2)}
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                        Processed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
