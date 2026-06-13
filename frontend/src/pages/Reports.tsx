import { useState } from 'react';
import { BarChart3, TrendingUp, Download, IndianRupee, ShoppingBag, Package, FileText, Info } from 'lucide-react';

const Reports = () => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'purchases' | 'expiry'>('sales');

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

  const tabs = [
    { id: 'sales', label: 'Sales Report', icon: FileText, color: 'text-green' },
    { id: 'inventory', label: 'Inventory Report', icon: Package, color: 'text-sky' },
    { id: 'purchases', label: 'Purchase Report', icon: ShoppingBag, color: 'text-amber' },
    { id: 'expiry', label: 'Expiry Report', icon: BarChart3, color: 'text-red' },
  ] as const;

  return (
    <div className="h-full flex flex-col fade-in gap-4 min-h-0 overflow-hidden text-text bg-bg">
      {/* Date Controls & Action Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-bg2 border border-border p-3 rounded-xl flex-shrink-0">
        <div className="flex items-center gap-2">
          <Info size={16} className="text-primary shrink-0 animate-pulse" />
          <span className="text-xs text-muted font-medium">Placeholder stats shown. Engine incoming.</span>
        </div>
        <div className="flex gap-2 items-center flex-wrap w-full sm:w-auto justify-end">
          <div className="flex items-center gap-1.5 text-xs text-muted font-semibold">
            <span>From</span>
            <input
              type="date"
              className="bg-bg3 border border-glass-border rounded-lg px-2 py-1 text-text text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From Date"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted font-semibold">
            <span>To</span>
            <input
              type="date"
              className="bg-bg3 border border-glass-border rounded-lg px-2 py-1 text-text text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To Date"
            />
          </div>
          <button
            className="bg-green hover:bg-green/95 text-white font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
            title="Generate Report"
          >
            <BarChart3 size={14} />
            <span>Generate</span>
          </button>
        </div>
      </div>

      {/* Stats Grid - Compact Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-bg2 border border-border rounded-xl p-4 relative overflow-hidden group">
              <div
                className="absolute top-0 right-0 w-24 h-24 translate-x-6 -translate-y-6 pointer-events-none"
                style={{ background: `radial-gradient(circle, ${card.gradient} 0%, transparent 70%)` }}
              />
              <Icon className="absolute right-4 top-4 text-muted/20" size={24} />
              <div className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">{card.label}</div>
              <div className={`text-2xl font-black ${colorMap[card.color]} mb-1`}>
                {card.value}
              </div>
              <div className="text-[9px] text-muted font-medium">
                No active records
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Workspace: Split tabs left, selected table right */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        
        {/* Left Tabs Selection Sidebar */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-2 bg-bg2 border border-border rounded-xl p-3 overflow-y-auto scrollbar-thin">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted px-2 mb-1">Select Report</h3>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all text-left ${
                  isActive
                    ? 'bg-primary/10 border-primary text-text font-bold'
                    : 'bg-bg3/30 border-glass-border text-muted hover:text-text hover:bg-bg3'
                }`}
              >
                <Icon size={16} className={isActive ? tab.color : 'text-muted'} />
                <span className="flex-1 truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Active Table Panel */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-bg2 border border-border rounded-xl">
          {activeTab === 'sales' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 border-b border-glass-border flex justify-between items-center bg-bg3/30 flex-shrink-0">
                <h3 className="font-bold text-sm flex items-center gap-2 text-text">
                  <FileText size={18} className="text-green" />
                  <span>Sales Records</span>
                </h3>
                <button
                  className="p-1.5 hover:bg-bg3 rounded-lg text-muted hover:text-text transition-all"
                  aria-label="Download Sales Report"
                  title="Download Sales Report"
                >
                  <Download size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-bg2 border-b border-glass-border shadow-sm">
                    <tr className="text-muted">
                      <th className="p-3 font-semibold border-b border-glass-border">Date</th>
                      <th className="p-3 font-semibold border-b border-glass-border">Invoice</th>
                      <th className="p-3 font-semibold border-b border-glass-border">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-bg3/20 transition-colors border-b border-glass-border/30">
                      <td colSpan={3} className="p-12 text-center text-xs text-muted">No sales records found</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 border-b border-glass-border flex justify-between items-center bg-bg3/30 flex-shrink-0">
                <h3 className="font-bold text-sm flex items-center gap-2 text-text">
                  <Package size={18} className="text-sky" />
                  <span>Inventory Status</span>
                </h3>
                <button
                  className="p-1.5 hover:bg-bg3 rounded-lg text-muted hover:text-text transition-all"
                  aria-label="Download Inventory Report"
                  title="Download Inventory Report"
                >
                  <Download size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-bg2 border-b border-glass-border shadow-sm">
                    <tr className="text-muted">
                      <th className="p-3 font-semibold border-b border-glass-border">Medicine</th>
                      <th className="p-3 font-semibold border-b border-glass-border">Stock</th>
                      <th className="p-3 font-semibold border-b border-glass-border">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-bg3/20 transition-colors border-b border-glass-border/30">
                      <td colSpan={3} className="p-12 text-center text-xs text-muted">No inventory records found</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'purchases' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 border-b border-glass-border flex justify-between items-center bg-bg3/30 flex-shrink-0">
                <h3 className="font-bold text-sm flex items-center gap-2 text-text">
                  <ShoppingBag size={18} className="text-amber" />
                  <span>Purchase Logs</span>
                </h3>
                <button
                  className="p-1.5 hover:bg-bg3 rounded-lg text-muted hover:text-text transition-all"
                  aria-label="Download Purchase Report"
                  title="Download Purchase Report"
                >
                  <Download size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-bg2 border-b border-glass-border shadow-sm">
                    <tr className="text-muted">
                      <th className="p-3 font-semibold border-b border-glass-border">Distributor</th>
                      <th className="p-3 font-semibold border-b border-glass-border">Invoice</th>
                      <th className="p-3 font-semibold border-b border-glass-border">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-bg3/20 transition-colors border-b border-glass-border/30">
                      <td colSpan={3} className="p-12 text-center text-xs text-muted">No purchase records found</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'expiry' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 border-b border-glass-border flex justify-between items-center bg-bg3/30 flex-shrink-0">
                <h3 className="font-bold text-sm flex items-center gap-2 text-text">
                  <BarChart3 size={18} className="text-red" />
                  <span>Expiry Warning List</span>
                </h3>
                <button
                  className="p-1.5 hover:bg-bg3 rounded-lg text-muted hover:text-text transition-all"
                  aria-label="Download Expiry Report"
                  title="Download Expiry Report"
                >
                  <Download size={15} />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-bg2 border-b border-glass-border shadow-sm">
                    <tr className="text-muted">
                      <th className="p-3 font-semibold border-b border-glass-border">Medicine</th>
                      <th className="p-3 font-semibold border-b border-glass-border">Batch</th>
                      <th className="p-3 font-semibold border-b border-glass-border">Expiry Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-bg3/20 transition-colors border-b border-glass-border/30">
                      <td colSpan={3} className="p-12 text-center text-xs text-muted">No expiry records found</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};

export default Reports;
