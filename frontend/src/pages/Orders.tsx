import { useEffect, useState } from 'react';
import { 
  ClipboardList, 
  Plus, 
  Trash2, 
  Send, 
  Check, 
  AlertTriangle, 
  Bell, 
  Clock, 
  Search, 
  AlertCircle, 
  RefreshCw 
} from 'lucide-react';
import { api } from '../services/api';
import type { SpecialOrder } from '../services/api';

const Orders = () => {
  const [orders, setOrders] = useState<SpecialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Alert/Notification State
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // New Request Form State
  const [product, setProduct] = useState('');
  const [requester, setRequester] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [priority, setPriority] = useState('Normal');
  const [status, setStatus] = useState('Pending');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Fetch all orders
  const fetchOrders = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const data = await api.getOrders();
      // STRICT RULE: Only show last 100
      setOrders(Array.isArray(data) ? data.slice(0, 100) : []);
    } catch (err) {
      console.error('Failed to fetch special orders:', err);
      showNotification('Failed to load orders. Please check your connection.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    const handleRefresh = () => {
      fetchOrders(true);
    };
    window.addEventListener('refresh-special-orders', handleRefresh);
    return () => {
      window.removeEventListener('refresh-special-orders', handleRefresh);
    };
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // Submit new special order request
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product.trim()) {
      showNotification('Product name is required.', 'error');
      return;
    }

    setFormSubmitting(true);
    try {
      await api.createOrder({
        product: product.trim(),
        requester: requester.trim() || 'Anonymous',
        phone: phone.replace(/\D/g, '') || '',
        qty,
        priority,
        status
      });

      showNotification(`Order for "${product}" logged successfully!`, 'success');
      
      // Reset form
      setProduct('');
      setRequester('');
      setPhone('');
      setQty(1);
      setPriority('Normal');
      setStatus('Pending');
      
      // Refresh list
      fetchOrders();
    } catch (err) {
      console.error('Error creating order:', err);
      showNotification('Failed to register special order.', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Update order status/priority inline
  const handleUpdate = async (id: number, field: string, value: any) => {
    try {
      const originalOrder = orders.find(o => o.id === id);
      if (!originalOrder) return;

      const updatedFields = { [field]: value };
      
      // Optimistic Update
      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updatedFields } : o));

      await api.updateOrder(id, updatedFields);
      
      if (field === 'status') {
        showNotification(`Order status updated to "${value}".`, 'success');
        // Backend automatically sends WhatsApp when status → 'Ready' (see orders.ts route)
        // Re-fetch to get updated notified flag from server
        const refreshed = await api.getOrders();
        setOrders(refreshed);
        const updated = refreshed.find((o: any) => o.id === id);
        if (value === 'Ready' && updated?.notified === 1 && originalOrder.phone) {
          showNotification('✅ WhatsApp notification sent to customer.', 'info');
        }
      } else {
        showNotification('Order details updated.', 'success');
        fetchOrders();
      }
    } catch (err) {
      console.error('Error updating order:', err);
      showNotification('Failed to update order.', 'error');
      // Revert from server
      fetchOrders();
    }
  };

  // Delete an order
  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this special order request?')) return;

    try {
      // Optimistic Delete
      setOrders(prev => prev.filter(o => o.id !== id));
      await api.deleteOrder(id);
      showNotification('Special order deleted.', 'success');
    } catch (err) {
      console.error('Error deleting order:', err);
      showNotification('Failed to delete order.', 'error');
      fetchOrders();
    }
  };

  // Trigger Uncollected Reminders Scan
  const handleScanUncollected = async () => {
    setRefreshing(true);
    try {
      const alertedList = await api.getUncollectedAlerts();
      const notifiedCount = alertedList.filter(o => o.notified).length;
      
      if (notifiedCount > 0) {
        showNotification(`Reminders scan complete. Sent WhatsApp alerts to ${notifiedCount} customer(s).`, 'success');
      } else {
        showNotification('No uncollected orders required notifications at this time.', 'info');
      }
      
      fetchOrders();
    } catch (err) {
      console.error('Error scanning uncollected alerts:', err);
      showNotification('Failed to execute uncollected alerts reminders.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  // Filtering and Searching
  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.requester.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.phone && o.phone.includes(searchQuery));
      
    const matchesStatus = statusFilter === 'All' || o.status === statusFilter;
    
    let matchesDate = true;
    if (dateFrom || dateTo) {
      if (!o.created_at) {
        matchesDate = false;
      } else {
        const itemDate = o.created_at.substring(0, 10);
        const start = dateFrom || '0000-00-00';
        const end = dateTo || '9999-99-99';
        matchesDate = itemDate >= start && itemDate <= end;
      }
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  const getPriorityBadgeColor = (p: string) => {
    switch (p) {
      case 'High':
        return 'bg-red-500/10 border-red-500/30 text-red';
      case 'Normal':
        return 'bg-primary/10 border-primary/30 text-primary';
      case 'Low':
        return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
      default:
        return 'bg-white/5 border-glass-border text-muted';
    }
  };

  const getStatusBadgeColor = (s: string) => {
    switch (s) {
      case 'Pending':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-500';
      case 'Ordered':
        return 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400';
      case 'Ready':
        return 'bg-sky-500/10 border-sky-500/30 text-sky-400';
      case 'Completed':
        return 'bg-green/10 border-green/30 text-green';
      default:
        return 'bg-white/5 border-glass-border text-muted';
    }
  };

  return (
    <div className="h-full flex flex-col fade-in space-y-6">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl animate-slide-in ${
          notification.type === 'success' 
            ? 'bg-green/15 border-green/30 text-green-200' 
            : notification.type === 'error'
              ? 'bg-red/15 border-red/30 text-red-200'
              : 'bg-primary/15 border-primary/30 text-primary-light'
        }`}>
          {notification.type === 'success' ? (
            <Check size={16} className="text-green animate-bounce" />
          ) : notification.type === 'error' ? (
            <AlertCircle size={16} className="text-red" />
          ) : (
            <Bell size={16} className="text-primary animate-pulse" />
          )}
          <span className="text-xs font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ClipboardList className="text-primary" size={22} />
            Out-of-Stock Orders & Requests
          </h2>
          <p className="text-xs text-muted mt-1">Log customer medicine requests, monitor statuses, and automate pickup notifications.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={handleScanUncollected}
            disabled={refreshing || loading}
            className="premium-btn bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500/20 text-xs px-3 py-2 disabled:opacity-50"
            title="Scan orders ready for 2+ days and send auto WhatsApp reminder notifications."
          >
            <AlertTriangle size={14} className={refreshing ? 'animate-spin' : ''} />
            Auto Remind Uncollected
          </button>
          <button 
            onClick={() => fetchOrders(true)} 
            disabled={refreshing}
            className="p-2 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 hover:text-white transition-all text-muted"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 min-h-0">
        
        {/* LEFT COLUMN: Form to register requests */}
        <div className="xl:col-span-1 flex flex-col min-h-0 overflow-y-auto scrollbar-thin">
          <div className="glass-panel p-6 flex-1">
            <h3 className="font-bold flex items-center gap-2 mb-6 text-sm text-text border-b border-glass-border/30 pb-3">
              <Plus size={16} className="text-primary" /> 
              Register Out-of-Stock Request
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Requested Medicine Name *</label>
                <input 
                  type="text" 
                  required
                  value={product}
                  onChange={e => setProduct(e.target.value)}
                  className="premium-input w-full font-semibold" 
                  placeholder="e.g. Lipitor 10mg / Salt composition" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Quantity Requested</label>
                <input 
                  type="number" 
                  value={qty}
                  onChange={e => setQty(Math.max(1, Number(e.target.value)))}
                  className="premium-input w-full font-mono font-semibold" 
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Customer Name</label>
                <input 
                  type="text" 
                  value={requester}
                  onChange={e => setRequester(e.target.value)}
                  className="premium-input w-full font-semibold" 
                  placeholder="Patient / Requester Name" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted uppercase tracking-wider">10-Digit Mobile (For WhatsApp Notify)</label>
                <input 
                  type="tel" 
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="premium-input w-full font-mono" 
                  placeholder="e.g. 9876543210" 
                  maxLength={10}
                />
                <p className="text-[9px] text-muted">Auto sends order confirmation WhatsApp when submitted.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Priority</label>
                  <select 
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    className="premium-input w-full bg-[#18181b] border-glass-border/60 text-xs font-semibold py-2"
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Initial Status</label>
                  <select 
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="premium-input w-full bg-[#18181b] border-glass-border/60 text-xs font-semibold py-2"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Ordered">Ordered</option>
                    <option value="Ready">Ready</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit"
                disabled={formSubmitting}
                className="premium-btn bg-primary text-white shadow-[0_4px_14px_rgba(14,165,233,0.3)] hover:bg-sky-600 w-full mt-4 font-bold disabled:opacity-50"
              >
                {formSubmitting ? 'Logging Request...' : 'Log Special Order'}
                <Send size={14} className="ml-1" />
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Table Directory of Requests */}
        <div className="xl:col-span-3 glass-panel flex flex-col overflow-hidden bg-white/5 border-glass-border">
          
          {/* Table Toolbar (Search, Filter Tabs) */}
          <div className="p-4 border-b border-glass-border bg-black/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {['All', 'Pending', 'Ordered', 'Ready', 'Completed'].map(t => (
                <button
                  key={t}
                  onClick={() => setStatusFilter(t)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all select-none ${
                    statusFilter === t
                      ? 'bg-primary/20 border-primary text-primary font-bold shadow-[0_0_12px_rgba(14,165,233,0.15)]'
                      : 'bg-white/5 border-glass-border/60 text-muted hover:text-text hover:bg-white/10'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative max-w-sm w-full md:w-64">
              <Search className="absolute left-3 top-2.5 text-muted" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search product, name, phone..."
                className="premium-input pl-9 pr-4 py-1.5 text-xs w-full"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="px-2 py-1 bg-black/20 border border-glass-border rounded text-xs text-text focus:outline-none focus:border-primary/50"
              />
              <label className="text-xs font-semibold text-muted ml-2">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="px-2 py-1 bg-black/20 border border-glass-border rounded text-xs text-text focus:outline-none focus:border-primary/50"
              />
            </div>

          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10 select-none">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60">Product / Medicine Requested</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60">Requester (Customer)</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60 text-center">Qty</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60 text-center">Priority</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60">Status</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60 text-center">WhatsApp Status</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60 text-right">Requested Date</th>
                  <th className="p-4 text-xs font-bold text-muted border-b border-glass-border/60"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-muted font-semibold">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-primary opacity-60" />
                      Loading out-of-stock requests...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-16 text-center text-muted font-semibold">
                      <ClipboardList size={36} className="mx-auto mb-3 text-muted/40" />
                      No special order requests found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} className="hover:bg-white/5 border-b border-glass-border/20 transition-all">
                      {/* Product Name */}
                      <td className="p-4 font-semibold text-text max-w-[200px] truncate">
                        {order.product}
                      </td>

                      {/* Requester Contact */}
                      <td className="p-4">
                        <div className="font-semibold text-text">{order.requester}</div>
                        {order.phone && (
                          <div className="text-[10px] text-muted font-mono mt-0.5">{order.phone}</div>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="p-4 text-center font-bold font-mono">
                        {order.qty}
                      </td>

                      {/* Priority (Editable dropdown/badge) */}
                      <td className="p-4 text-center">
                        <select
                          value={order.priority}
                          onChange={e => handleUpdate(order.id, 'priority', e.target.value)}
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold outline-none cursor-pointer text-center bg-[#18181b] ${getPriorityBadgeColor(order.priority)}`}
                        >
                          <option value="Low">Low</option>
                          <option value="Normal">Normal</option>
                          <option value="High">High</option>
                        </select>
                      </td>

                      {/* Status (Editable select) */}
                      <td className="p-4">
                        <select
                          value={order.status}
                          onChange={e => handleUpdate(order.id, 'status', e.target.value)}
                          className={`px-2 py-1 rounded border text-[10px] font-bold outline-none cursor-pointer font-sans bg-[#18181b] ${getStatusBadgeColor(order.status)}`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Ordered">Ordered</option>
                          <option value="Ready">Ready</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>

                      {/* WhatsApp Notification Status */}
                      <td className="p-4 text-center">
                        {order.phone ? (
                          order.notified === 1 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-green bg-green/10 px-2 py-0.5 rounded-full border border-green/30 select-none">
                              <Bell size={10} className="animate-pulse" />
                              Notified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted bg-white/5 px-2 py-0.5 rounded-full border border-glass-border select-none">
                              <Clock size={10} />
                              Pending Alert
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-muted/65 italic select-none">No Phone</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="p-4 text-right text-muted font-mono select-none">
                        {new Date(order.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="p-1.5 hover:bg-red/10 text-muted hover:text-red rounded-lg transition-all"
                          title="Delete Request"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Stats */}
          <div className="p-3 border-t border-glass-border bg-black/10 text-muted select-none flex justify-between items-center px-4">
            <span>Total Requests: <strong>{filteredOrders.length}</strong></span>
            {orders.some(o => o.status === 'Ready') && (
              <span className="flex items-center gap-1.5 text-xs text-sky">
                <Bell size={12} className="animate-bounce" />
                Some requests are ready for pickup
              </span>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

export default Orders;
