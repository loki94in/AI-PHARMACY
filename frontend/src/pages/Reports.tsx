import { useState } from 'react';
import { BarChart3, TrendingUp, Download, IndianRupee, ShoppingBag, Package, FileText, Info } from 'lucide-react';

const Reports = () => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const statsCards = [
    {
      label: 'Total Revenue',
      value: '₹0.00',
      icon: IndianRupee,
      color: 'green',
      gradient: 'rgba(16,185,129,0.15)',
    },
    {
      label: 'Total Purchases',
      value: '₹0.00',
      icon: ShoppingBag,
      color: 'sky',
      gradient: 'rgba(14,165,233,0.15)',
    },
    {
      label: 'Profit Margin',
      value: '0%',
      icon: TrendingUp,
      color: 'amber',
      gradient: 'rgba(245,158,11,0.15)',
    },
    {
      label: 'Items Sold',
      value: '0',
      icon: Package,
      color: 'primary',
      gradient: 'rgba(59,130,246,0.15)',
    },
  ];

  const colorMap: Record<string, string> = {
    green: 'text-green',
    sky: 'text-sky',
    amber: 'text-amber',
    primary: 'text-primary',
  };

  return (
    <div className="h-full flex flex-col fade-in space-y-6 overflow-y-auto pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-1">Reports &amp; Analytics</h2>
          <p className="text-muted text-sm">Generate and view business intelligence reports.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="space-y-0">
            <label htmlFor="report-from-date" className="sr-only">From Date</label>
            <input
              id="report-from-date"
              type="date"
              className="premium-input text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From Date"
              title="From Date"
            />
          </div>
          <span className="text-muted text-xs">to</span>
          <div className="space-y-0">
            <label htmlFor="report-to-date" className="sr-only">To Date</label>
            <input
              id="report-to-date"
              type="date"
              className="premium-input text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To Date"
              title="To Date"
            />
          </div>
          <button
            className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600"
            aria-label="Generate Report"
            title="Generate Report"
          >
            <BarChart3 size={16} />
            Generate
          </button>
        </div>
      </div>

      {/* Coming Soon Banner */}
      <div className="glass-panel p-4 border-primary/30 flex items-center gap-3">
        <Info size={18} className="text-primary shrink-0" />
        <p className="text-sm text-muted">
          <span className="font-semibold text-primary">Reports engine coming soon.</span>{' '}
          Placeholder data is shown below. Full analytics with charts and export will be available in the next update.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="glass-panel p-6 relative overflow-hidden group">
              <div
                className="absolute top-0 right-0 w-32 h-32 translate-x-8 -translate-y-8"
                style={{ background: `radial-gradient(circle, ${card.gradient} 0%, transparent 70%)` }}
              />
              <Icon className="absolute right-6 top-6 text-muted/30" size={28} />
              <div className="text-xs text-muted font-bold uppercase tracking-wider mb-2">{card.label}</div>
              <div className={`text-3xl font-extrabold ${colorMap[card.color]} mb-3`}>
                {card.value}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                No data yet
              </div>
            </div>
          );
        })}
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Report */}
        <div className="glass-panel flex flex-col overflow-hidden">
          <div className="p-5 border-b border-glass-border flex justify-between items-center bg-white/5">
            <h3 className="font-bold flex items-center gap-2">
              <FileText size={18} className="text-green" />
              Sales Report
            </h3>
            <button
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted hover:text-white"
              aria-label="Download Sales Report"
              title="Download Sales Report"
            >
              <Download size={16} />
            </button>
          </div>
          <div className="overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Date</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Invoice</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm">01-06-2026</td>
                  <td className="p-4 text-sm font-semibold text-sky">INV-0001</td>
                  <td className="p-4 text-sm font-bold text-green">₹1,250.00</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm">01-06-2026</td>
                  <td className="p-4 text-sm font-semibold text-sky">INV-0002</td>
                  <td className="p-4 text-sm font-bold text-green">₹780.50</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm">02-06-2026</td>
                  <td className="p-4 text-sm font-semibold text-sky">INV-0003</td>
                  <td className="p-4 text-sm font-bold text-green">₹2,340.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventory Report */}
        <div className="glass-panel flex flex-col overflow-hidden">
          <div className="p-5 border-b border-glass-border flex justify-between items-center bg-white/5">
            <h3 className="font-bold flex items-center gap-2">
              <Package size={18} className="text-sky" />
              Inventory Report
            </h3>
            <button
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted hover:text-white"
              aria-label="Download Inventory Report"
              title="Download Inventory Report"
            >
              <Download size={16} />
            </button>
          </div>
          <div className="overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Medicine</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Stock</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm font-semibold">Paracetamol 500mg</td>
                  <td className="p-4 text-sm">120 units</td>
                  <td className="p-4 text-sm font-bold text-green">₹3,600.00</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm font-semibold">Amoxicillin 250mg</td>
                  <td className="p-4 text-sm">45 units</td>
                  <td className="p-4 text-sm font-bold text-green">₹2,025.00</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm font-semibold">Cetirizine 10mg</td>
                  <td className="p-4 text-sm">200 units</td>
                  <td className="p-4 text-sm font-bold text-green">₹1,400.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Purchase Report */}
        <div className="glass-panel flex flex-col overflow-hidden">
          <div className="p-5 border-b border-glass-border flex justify-between items-center bg-white/5">
            <h3 className="font-bold flex items-center gap-2">
              <ShoppingBag size={18} className="text-amber" />
              Purchase Report
            </h3>
            <button
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted hover:text-white"
              aria-label="Download Purchase Report"
              title="Download Purchase Report"
            >
              <Download size={16} />
            </button>
          </div>
          <div className="overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Distributor</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Invoice</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm font-semibold">Apollo Pharma</td>
                  <td className="p-4 text-sm font-semibold text-sky">PUR-0501</td>
                  <td className="p-4 text-sm font-bold text-amber">₹15,400.00</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm font-semibold">MedPlus Supply</td>
                  <td className="p-4 text-sm font-semibold text-sky">PUR-0502</td>
                  <td className="p-4 text-sm font-bold text-amber">₹8,720.00</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm font-semibold">HealthCare Dist.</td>
                  <td className="p-4 text-sm font-semibold text-sky">PUR-0503</td>
                  <td className="p-4 text-sm font-bold text-amber">₹6,150.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Expiry Report */}
        <div className="glass-panel flex flex-col overflow-hidden">
          <div className="p-5 border-b border-glass-border flex justify-between items-center bg-white/5">
            <h3 className="font-bold flex items-center gap-2">
              <BarChart3 size={18} className="text-red" />
              Expiry Report
            </h3>
            <button
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted hover:text-white"
              aria-label="Download Expiry Report"
              title="Download Expiry Report"
            >
              <Download size={16} />
            </button>
          </div>
          <div className="overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Medicine</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Batch</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Expiry Date</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm font-semibold">Ibuprofen 400mg</td>
                  <td className="p-4 text-sm text-muted">BATCH-A12</td>
                  <td className="p-4 text-sm font-bold text-red">15-07-2026</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm font-semibold">Metformin 500mg</td>
                  <td className="p-4 text-sm text-muted">BATCH-B34</td>
                  <td className="p-4 text-sm font-bold text-red">22-08-2026</td>
                </tr>
                <tr className="hover:bg-white/5 transition-colors border-b border-glass-border">
                  <td className="p-4 text-sm font-semibold">Omeprazole 20mg</td>
                  <td className="p-4 text-sm text-muted">BATCH-C56</td>
                  <td className="p-4 text-sm font-bold text-amber">10-12-2026</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
