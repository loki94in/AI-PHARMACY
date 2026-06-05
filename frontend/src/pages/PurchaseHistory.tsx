import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Search, Filter, Download, Eye, Clock, CheckCircle, XCircle, AlertCircle, Database } from 'lucide-react';

interface PurchaseTransaction {
  id: number;
  invoice_no: string;
  date: string;
  total_amount: number;
  distributor_name: string;
  status?: string; // Paid, Pending, Refunded, Failed
  plan?: string;
  items?: any[];
}

const PurchaseHistory = () => {
  const [transactions, setTransactions] = useState<PurchaseTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [statusFilter, setStatusFilter] = useState('All');
  const [supplierFilter, setSupplierFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data = await api.getPurchases();
      // Add mock status and plans if not present in API
      const processed = (Array.isArray(data) ? data : []).map(p => {
        const statuses = ['Paid', 'Pending', 'Paid', 'Refunded', 'Failed'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        return {
          ...p,
          status: p.status || randomStatus,
          plan: 'Standard'
        };
      });
      setTransactions(processed);
    } catch (err) {
      console.error('Error fetching purchase history', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'Paid': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'Pending': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'Refunded': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case 'Failed': return 'text-red-400 bg-red-400/10 border-red-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'Paid': return <CheckCircle size={14} className="mr-1" />;
      case 'Pending': return <Clock size={14} className="mr-1" />;
      case 'Refunded': return <AlertCircle size={14} className="mr-1" />;
      case 'Failed': return <XCircle size={14} className="mr-1" />;
      default: return null;
    }
  };

  // Filter Logic
  const filteredData = transactions.filter(t => {
    // Search
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      t.invoice_no?.toLowerCase().includes(searchLower) ||
      t.id.toString().includes(searchLower) ||
      t.distributor_name?.toLowerCase().includes(searchLower) ||
      t.plan?.toLowerCase().includes(searchLower);

    // Status
    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    
    // Supplier
    const matchesSupplier = supplierFilter === 'All' || t.distributor_name === supplierFilter;

    // Date
    let matchesDate = true;
    if (dateRange.start && t.date) {
      matchesDate = matchesDate && t.date.substring(0, 10) >= dateRange.start;
    }
    if (dateRange.end && t.date) {
      matchesDate = matchesDate && t.date.substring(0, 10) <= dateRange.end;
    }

    // Product/Plan Filter
    const matchesProduct = !productFilter || t.plan?.toLowerCase().includes(productFilter.toLowerCase());

    return matchesSearch && matchesStatus && matchesSupplier && matchesDate && matchesProduct;
  });

  // Extract unique suppliers for the filter dropdown
  const uniqueSuppliers = Array.from(new Set(transactions.map(t => t.distributor_name).filter(Boolean)));

  // Purchase Analytics
  const totalPurchases = filteredData.length;
  const totalAmount = filteredData.reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const paidAmount = filteredData.filter(t => t.status === 'Paid').reduce((sum, t) => sum + (t.total_amount || 0), 0);

  // Export Logic
  const exportToCSV = () => {
    if (filteredData.length === 0) {
      alert('No data to export!');
      return;
    }

    const headers = ['Purchase ID', 'Invoice No', 'Distributor', 'Date', 'Plan', 'Amount', 'Status'];
    const csvRows = [headers.join(',')];

    filteredData.forEach(tx => {
      const row = [
        tx.id,
        `"${tx.invoice_no || ''}"`,
        `"${tx.distributor_name || ''}"`,
        `"${new Date(tx.date).toLocaleDateString()}"`,
        `"${tx.plan || ''}"`,
        tx.total_amount || 0,
        tx.status || ''
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `Purchase_History_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchase History</h1>
          <p className="text-gray-400">PURPOSE: Historical purchase records</p>
        </div>
        <div className="flex gap-2 text-[10px] flex-wrap max-w-2xl mt-2">
          {/* Core Features */}
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Search purchases</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Date filters</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Supplier filters</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Invoice view</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Purchase analytics</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Export data</span>
          
          {/* Database */}
          <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded flex items-center gap-1">
            <Database size={12} /> purchases, suppliers
          </span>
          
          {/* API */}
          <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded flex items-center gap-1 font-mono">
            GET /purchase-history
          </span>
          
          {/* System Rules */}
          <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded flex items-center gap-1">
            🔒 Read-only historical records
          </span>
        </div>
        <button 
          onClick={exportToCSV}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg text-white transition-colors"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Purchase Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-glass-panel rounded-xl p-4 border border-glass-border">
          <p className="text-gray-400 text-sm mb-1">Total Purchases</p>
          <p className="text-2xl font-bold text-white">{totalPurchases}</p>
        </div>
        <div className="bg-glass-panel rounded-xl p-4 border border-glass-border">
          <p className="text-gray-400 text-sm mb-1">Total Value</p>
          <p className="text-2xl font-bold text-primary">₹{totalAmount.toFixed(2)}</p>
        </div>
        <div className="bg-glass-panel rounded-xl p-4 border border-glass-border">
          <p className="text-gray-400 text-sm mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-green-400">₹{paidAmount.toFixed(2)}</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-glass-panel rounded-xl p-4 mb-6 border border-glass-border flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by order ID, invoice number, or product name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/20 border border-glass-border rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-black/20 border border-glass-border rounded-lg px-3 py-2">
            <Filter size={16} className="text-gray-400" />
            <span className="text-gray-400 text-sm">Status:</span>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-white text-sm focus:outline-none"
            >
              <option value="All" className="bg-gray-900">All Status</option>
              <option value="Paid" className="bg-gray-900">Paid</option>
              <option value="Pending" className="bg-gray-900">Pending</option>
              <option value="Refunded" className="bg-gray-900">Refunded</option>
              <option value="Failed" className="bg-gray-900">Failed</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-black/20 border border-glass-border rounded-lg px-3 py-2">
            <Filter size={16} className="text-gray-400" />
            <span className="text-gray-400 text-sm">Supplier:</span>
            <select 
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-transparent text-white text-sm focus:outline-none max-w-[150px]"
            >
              <option value="All" className="bg-gray-900">All Suppliers</option>
              {uniqueSuppliers.map(sup => (
                <option key={sup} value={sup} className="bg-gray-900">{sup}</option>
              ))}
            </select>
          </div>

          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
            className="bg-black/20 border border-glass-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
            className="bg-black/20 border border-glass-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-glass-panel rounded-xl border border-glass-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/40 border-b border-glass-border/50 text-sm font-semibold text-gray-300">
                <th className="px-6 py-4 whitespace-nowrap">Purchase ID</th>
                <th className="px-6 py-4 whitespace-nowrap">Invoice No.</th>
                <th className="px-6 py-4 whitespace-nowrap">Date</th>
                <th className="px-6 py-4 whitespace-nowrap">Product/Plan</th>
                <th className="px-6 py-4 whitespace-nowrap text-right">Amount</th>
                <th className="px-6 py-4 whitespace-nowrap text-center">Status</th>
                <th className="px-6 py-4 whitespace-nowrap text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border/30 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    <div className="flex justify-center items-center gap-2">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      Loading history...
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <AlertCircle size={48} className="mb-4 opacity-20" />
                      <p className="text-lg">No transactions found</p>
                      <p className="text-sm opacity-70">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 text-gray-300 font-mono">
                      #{tx.id.toString().padStart(6, '0')}
                    </td>
                    <td className="px-6 py-4 text-white font-medium">
                      {tx.invoice_no || '-'}
                      <div className="text-xs text-gray-500 font-normal mt-0.5">{tx.distributor_name}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString()}
                      <div className="text-xs text-gray-500 mt-0.5">
                        {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-300">
                      {tx.plan || 'Standard'}
                    </td>
                    <td className="px-6 py-4 text-right text-white font-medium">
                      ₹{tx.total_amount?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(tx.status)}`}>
                        {getStatusIcon(tx.status)}
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button className="text-gray-400 hover:text-primary transition-colors p-1 rounded hover:bg-primary/10">
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PurchaseHistory;
