// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api, apiClient } from '../services/api';
import { RotateCcw, Plus, Trash2, Search, FileText, AlertTriangle, Package, Layers } from 'lucide-react';

interface ReturnItem {
  id: string;
  medicine_id: number | null;
  medicine_name: string;
  batch_no: string;
  expiry_date: string;
  quantity: number;
  cost_price: number;
  mrp: number;
  purchase_item_id?: number;
  invoice_no?: string;
  purchase_date?: string;
  distributor_name?: string;
  distributor_id?: number;
}

interface GroupedReturn {
  distributor_id: number;
  distributor_name: string;
  invoice_no: string;
  purchase_date: string;
  items: ReturnItem[];
  total_amount: number;
}

const Returns: React.FC = () => {
  const [items, setItems] = useState<ReturnItem[]>([createEmptyItem()]);
  const [returnHistory, setReturnHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [showGroupedPreview, setShowGroupedPreview] = useState(false);
  const [groupedReturns, setGroupedReturns] = useState<GroupedReturn[]>([]);

  function createEmptyItem(): ReturnItem {
    return {
      id: crypto.randomUUID(),
      medicine_id: null,
      medicine_name: '',
      batch_no: '',
      expiry_date: '',
      quantity: 0,
      cost_price: 0,
      mrp: 0,
    };
  }

  const location = useLocation();

  useEffect(() => {
    fetchReturnHistory();
    // Auto-prefill from Expiry page navigation
    const prefilledItems = location.state?.prefilledReturnItems;
    if (prefilledItems && prefilledItems.length > 0) {
      const mapped = prefilledItems.map((item: any) => ({
        id: crypto.randomUUID(),
        medicine_id: item.medicine_id ?? null,
        medicine_name: item.medicine_name || '',
        batch_no: item.batch_no || '',
        expiry_date: item.expiry_date || '',
        quantity: item.quantity || 0,
        cost_price: item.mrp || 0,
        mrp: item.mrp || 0,
      }));
      setItems(mapped);
    }
  }, []);

  const fetchReturnHistory = async () => {
    setLoading(true);
    try {
      const response = await api.getReturns();
      setReturnHistory(response.data || []);
    } catch (error) {
      console.error('Error fetching returns:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchMedicines = useCallback(async (term: string, index: number) => {
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await api.lookupPurchases(term);
      setSearchResults(response.data || []);
      setActiveSearchIndex(index);
    } catch (error) {
      console.error('Error searching medicines:', error);
    }
  }, []);

  const selectMedicine = (purchase: any, index: number) => {
    const newItems = [...items];
    const item = newItems[index];

    item.medicine_id = purchase.medicine_id;
    item.medicine_name = purchase.medicine_name;
    item.batch_no = purchase.batch_no;
    item.expiry_date = purchase.expiry_date;
    item.cost_price = purchase.cost_price;
    item.mrp = purchase.mrp;
    item.purchase_item_id = purchase.purchase_item_id;
    item.invoice_no = purchase.invoice_no;
    item.purchase_date = purchase.purchase_date;
    item.distributor_name = purchase.distributor_name;
    item.distributor_id = purchase.distributor_id;

    setItems(newItems);
    setSearchResults([]);
    setActiveSearchIndex(null);
  };

  const updateItem = (index: number, field: keyof ReturnItem, value: any) => {
    const newItems = [...items];
    const item = newItems[index];

    if (field === 'quantity' || field === 'cost_price' || field === 'mrp') {
      (item as any)[field] = parseFloat(value) || 0;
    } else {
      (item as any)[field] = value;
    }

    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems([...items, createEmptyItem()]);
  };

  // Group items by distributor + invoice
  const groupItemsByInvoice = (): GroupedReturn[] => {
    const validItems = items.filter(item => item.medicine_id && item.quantity > 0);
    
    const grouped: { [key: string]: GroupedReturn } = {};
    
    validItems.forEach(item => {
      // Create key from distributor + invoice to group
      const key = `${item.distributor_id}_${item.invoice_no}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          distributor_id: item.distributor_id || 0,
          distributor_name: item.distributor_name || 'Unknown',
          invoice_no: item.invoice_no || 'N/A',
          purchase_date: item.purchase_date || '',
          items: [],
          total_amount: 0,
        };
      }
      
      grouped[key].items.push(item);
      grouped[key].total_amount += item.cost_price * item.quantity;
    });
    
    return Object.values(grouped);
  };

  const calculateGrandTotal = () => {
    return items
      .filter(item => item.medicine_id && item.quantity > 0)
      .reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);
  };

  const handlePreviewGrouped = () => {
    const grouped = groupItemsByInvoice();
    setGroupedReturns(grouped);
    setShowGroupedPreview(true);
  };

  const processReturn = async () => {
    const grouped = groupItemsByInvoice();
    
    if (grouped.length === 0) {
      alert('Please add at least one medicine with quantity');
      return;
    }

    setSaving(true);
    try {
      // Process each group separately (one return per distributor/invoice)
      for (const group of grouped) {
        await api.processReturns(group.items.map(item => ({
          medicine_id: item.medicine_id,
          batch_no: item.batch_no,
          quantity: item.quantity,
          cost_price: item.cost_price,
          mrp: item.mrp,
          distributor_id: group.distributor_id,
          invoice_no: group.invoice_no,
        })));
      }

      alert(`Successfully processed ${grouped.length} return(s)!`);
      setItems([createEmptyItem()]);
      setShowGroupedPreview(false);
      fetchReturnHistory();
    } catch (error) {
      console.error('Error processing return:', error);
      alert('Failed to process return');
    } finally {
      setSaving(false);
    }
  };

  const exportPDF = async () => {
    const grouped = groupItemsByInvoice();
    if (grouped.length === 0) {
      alert('No items to export');
      return;
    }

    try {
      // Export each group as separate PDF
      for (const group of grouped) {
        const blob = await api.exportReturnsPDF(group.items);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `return-${group.distributor_name}-${group.invoice_no}-${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Returns to Distributor</h1>
        <p className="text-gray-400">Add medicines batch-wise, auto-grouped by distributor & invoice</p>
      </div>

      {/* Items Table */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 border border-white/20">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">Add Return Items</h2>
          <button
            onClick={addItem}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            + Add Row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-300 border-b border-white/20">
                <th className="pb-3">#</th>
                <th className="pb-3">Medicine</th>
                <th className="pb-3">Batch</th>
                <th className="pb-3">Expiry</th>
                <th className="pb-3">Qty</th>
                <th className="pb-3">Cost Price</th>
                <th className="pb-3">Total</th>
                <th className="pb-3">Invoice Ref</th>
                <th className="pb-3">Distributor</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id} className="border-b border-white/10">
                  <td className="py-3 text-gray-300">{index + 1}</td>
                  <td className="py-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={item.medicine_name}
                        onChange={(e) => {
                          updateItem(index, 'medicine_name', e.target.value);
                          searchMedicines(e.target.value, index);
                        }}
                        className="w-48 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                        placeholder="Search medicine..."
                      />
                      {activeSearchIndex === index && searchResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {searchResults.map((result) => (
                            <button
                              key={result.purchase_item_id}
                              onClick={() => selectMedicine(result, index)}
                              className="w-full text-left px-4 py-2 hover:bg-white/10 text-white text-sm"
                            >
                              <div>{result.medicine_name}</div>
                              <div className="text-xs text-gray-400">
                                Batch: {result.batch_no} | ₹{result.cost_price} | {result.distributor_name} | Inv: {result.invoice_no}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <input
                      type="text"
                      value={item.batch_no}
                      onChange={(e) => updateItem(index, 'batch_no', e.target.value)}
                      className="w-24 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="text"
                      value={item.expiry_date}
                      onChange={(e) => updateItem(index, 'expiry_date', e.target.value)}
                      className="w-28 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                      placeholder="MM/YYYY"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                      min="0"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      value={item.cost_price}
                      onChange={(e) => updateItem(index, 'cost_price', e.target.value)}
                      className="w-20 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                      min="0"
                    />
                  </td>
                  <td className="py-3 text-white font-medium">
                    ₹{(item.cost_price * item.quantity).toFixed(2)}
                  </td>
                  <td className="py-3 text-gray-300 text-sm">
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                      {item.invoice_no || 'N/A'}
                    </span>
                  </td>
                  <td className="py-3 text-gray-300 text-sm">
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">
                      {item.distributor_name || 'N/A'}
                    </span>
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => removeItem(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary & Actions */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 border border-white/20">
        <div className="flex justify-between items-center">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Grand Total (All Items)</label>
            <p className="text-3xl font-bold text-white">₹{calculateGrandTotal().toFixed(2)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {items.filter(i => i.medicine_id && i.quantity > 0).length} items from{' '}
              {groupItemsByInvoice().length} distributor(s)
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={exportPDF}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2"
            >
              <FileText size={18} />
              Export PDF
            </button>
            <button
              onClick={handlePreviewGrouped}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2"
            >
              <Layers size={18} />
              Preview Grouped
            </button>
            <button
              onClick={processReturn}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              <RotateCcw size={18} />
              {saving ? 'Processing...' : 'Process Returns'}
            </button>
          </div>
        </div>
      </div>

      {/* Grouped Preview Modal */}
      {showGroupedPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-5xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">
                Preview: {groupedReturns.length} Separate Return Bill(s)
              </h3>
              <button
                onClick={() => setShowGroupedPreview(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {groupedReturns.map((group, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h4 className="text-white font-semibold">{group.distributor_name}</h4>
                      <p className="text-sm text-gray-400">
                        Invoice: <span className="text-blue-400">{group.invoice_no}</span> | 
                        Date: {group.purchase_date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 font-bold">₹{group.total_amount.toFixed(2)}</p>
                      <p className="text-xs text-gray-400">{group.items.length} item(s)</p>
                    </div>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-white/10">
                        <th className="pb-2 text-left">Medicine</th>
                        <th className="pb-2 text-left">Batch</th>
                        <th className="pb-2 text-left">Expiry</th>
                        <th className="pb-2 text-right">Qty</th>
                        <th className="pb-2 text-right">Cost</th>
                        <th className="pb-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item, i) => (
                        <tr key={i} className="border-b border-white/5">
                          <td className="py-2 text-white">{item.medicine_name}</td>
                          <td className="py-2 text-gray-300">{item.batch_no}</td>
                          <td className="py-2 text-gray-300">{item.expiry_date}</td>
                          <td className="py-2 text-right text-gray-300">{item.quantity}</td>
                          <td className="py-2 text-right text-gray-300">₹{item.cost_price}</td>
                          <td className="py-2 text-right text-white">₹{(item.cost_price * item.quantity).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowGroupedPreview(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={processReturn}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold disabled:opacity-50"
              >
                {saving ? 'Processing...' : 'Confirm & Process All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return History */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
        <h2 className="text-lg font-semibold text-white mb-4">Return History</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-300 border-b border-white/20">
                <th className="pb-3">ID</th>
                <th className="pb-3">Return No</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Date</th>
                <th className="pb-3">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">Loading...</td>
                </tr>
              ) : returnHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">No returns recorded yet.</td>
                </tr>
              ) : (
                returnHistory.slice(0, 10).map((ret) => (
                  <tr key={ret.id} className="border-b border-white/10 hover:bg-white/5">
                    <td className="py-3 text-gray-300">{ret.id}</td>
                    <td className="py-3 text-white font-medium">{ret.return_no}</td>
                    <td className="py-3">
                      <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
                        {ret.type || 'purchase'}
                      </span>
                    </td>
                    <td className="py-3 text-gray-300">{ret.date}</td>
                    <td className="py-3 text-white font-medium">₹{ret.total_amount?.toFixed(2) || '0.00'}</td>
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

export default Returns;
