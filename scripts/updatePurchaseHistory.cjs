const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../frontend/src/pages/PurchaseHistory.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Interface
content = content.replace(/interface PurchaseTransaction \{[\s\S]*?\}/, `interface PurchaseItem {
  id: number;
  purchase_id: number;
  invoice_no: string;
  purchase_date: string;
  distributor_name: string;
  medicine_name: string;
  batch_no: string;
  cost_price: number;
  mrp: number;
  packing_type: string;
  rack: string;
  gst_per: number;
  quantity: number;
  free_qty: number;
  total_stock: number;
  plan?: string;
}`);

// 2. State
content = content.replace(/const \[transactions, setTransactions\] = useState<PurchaseTransaction\[\]>\(\[\]\);/, 'const [items, setItems] = useState<PurchaseItem[]>([]);');

// 3. fetchHistory
content = content.replace(/const data = await api\.getPurchases\(\);/, 'const data = await api.getPurchaseItems();');
content = content.replace(/setTransactions\(Array\.isArray\(data\) \? data : \[\]\);/, 'setItems(Array.isArray(data) ? data : []);');

// 4. filteredData
content = content.replace(/const filteredData = transactions\.filter\(t => \{/, 'const filteredData = items.filter(t => {');

// 5. matchesSearch
content = content.replace(/const matchesSearch =[\s\S]*?t\.plan\?\.toLowerCase\(\)\.includes\(searchLower\);/, `const matchesSearch = 
      t.invoice_no?.toLowerCase().includes(searchLower) ||
      t.medicine_name?.toLowerCase().includes(searchLower) ||
      t.batch_no?.toLowerCase().includes(searchLower) ||
      t.distributor_name?.toLowerCase().includes(searchLower);`);

// 6. matchesDate
content = content.replace(/if \(dateRange\.start && t\.date\) \{[\s\S]*?matchesDate = matchesDate && t\.date\.substring\(0, 10\) <= dateRange\.end;\n    \}/, `if (dateRange.start && t.purchase_date) {
      matchesDate = matchesDate && t.purchase_date.substring(0, 10) >= dateRange.start;
    }
    if (dateRange.end && t.purchase_date) {
      matchesDate = matchesDate && t.purchase_date.substring(0, 10) <= dateRange.end;
    }`);

// 7. uniqueSuppliers
content = content.replace(/const uniqueSuppliers = Array\.from\(new Set\(transactions\.map/, 'const uniqueSuppliers = Array.from(new Set(items.map');

// 8. Max width
content = content.replace(/<div className="p-6 max-w-7xl mx-auto">/, '<div className="p-6 w-full px-6 mx-auto">');

// Analytics - we don't have total_amount on items, so let's simplify or compute differently.
// Purchase Analytics is based on unique purchases.
content = content.replace(/\/\/ Purchase Analytics[\s\S]*?const paidAmount = totalAmount; \/\/ Cash workflow, all are paid/, `// Purchase Analytics
  const uniquePurchases = new Set(filteredData.map(t => t.purchase_id));
  const totalPurchases = uniquePurchases.size;
  // Calculate total amount differently if needed, but since we don't have it per invoice here easily without grouping, we can show total item value.
  const totalAmount = filteredData.reduce((sum, t) => sum + ((t.cost_price || 0) * (t.quantity || 0)), 0);
  const paidAmount = totalAmount;`);

// Export logic
content = content.replace(/const exportToCSV = \(\) => \{[\s\S]*?document\.body\.removeChild\(link\);\n  \};/, `const exportToCSV = () => {
    if (filteredData.length === 0) {
      alert('No data to export!');
      return;
    }

    const headers = ['Invoice No', 'Date', 'Distributor', 'Medicine', 'Batch', 'Rate', 'MRP', 'Qty', 'Free Qty'];
    const csvRows = [headers.join(',')];

    filteredData.forEach(tx => {
      const row = [
        \`"\${tx.invoice_no || ''}"\`,
        \`"\${new Date(tx.purchase_date).toLocaleDateString()}"\`,
        \`"\${tx.distributor_name || ''}"\`,
        \`"\${tx.medicine_name || ''}"\`,
        \`"\${tx.batch_no || ''}"\`,
        tx.cost_price || 0,
        tx.mrp || 0,
        tx.quantity || 0,
        tx.free_qty || 0
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', \`Itemwise_Purchase_History_\${new Date().toISOString().split('T')[0]}.csv\`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };`);


// Table header
const oldThead = `                <thead>
                  <tr className="bg-black/40 border-b border-glass-border/50 text-sm font-semibold text-gray-300">
                    <th className="px-6 py-4 whitespace-nowrap">Purchase ID</th>
                    <th className="px-6 py-4 whitespace-nowrap">Invoice No.</th>
                    <th className="px-6 py-4 whitespace-nowrap">Date</th>
                    <th className="px-6 py-4 whitespace-nowrap text-right">Amount</th>
                    <th className="px-6 py-4 whitespace-nowrap text-center">Action</th>
                  </tr>
                </thead>`;

const newThead = `                <thead>
                  <tr className="bg-black/40 border-b border-glass-border/50 text-sm font-semibold text-gray-300">
                    <th className="px-4 py-4 whitespace-nowrap">S.No</th>
                    <th className="px-4 py-4 whitespace-nowrap">Invoice & Date</th>
                    <th className="px-4 py-4 whitespace-nowrap">Medicine Name</th>
                    <th className="px-4 py-4 whitespace-nowrap">Batch</th>
                    <th className="px-4 py-4 whitespace-nowrap">Rate</th>
                    <th className="px-4 py-4 whitespace-nowrap">MRP</th>
                    <th className="px-4 py-4 whitespace-nowrap">Packing</th>
                    <th className="px-4 py-4 whitespace-nowrap">Rack</th>
                    <th className="px-4 py-4 whitespace-nowrap">GST%</th>
                    <th className="px-4 py-4 whitespace-nowrap">Qty</th>
                    <th className="px-4 py-4 whitespace-nowrap">Free Qty</th>
                    <th className="px-4 py-4 whitespace-nowrap">Total Stock</th>
                    <th className="px-4 py-4 whitespace-nowrap text-center">Action</th>
                  </tr>
                </thead>`;

content = content.replace(oldThead, newThead);

// Table body
const oldTbodyMap = `filteredData.map((tx) => (
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
                        <td className="px-6 py-4 text-right text-white font-medium">
                          ₹{tx.total_amount?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEdit(tx.id)} className="text-gray-400 hover:text-primary transition-colors p-1 rounded hover:bg-primary/10" title="View Details">
                              <Eye size={16} />
                            </button>
                            <button onClick={() => openEdit(tx.id)} className="text-gray-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-blue-400/10" title="Edit Purchase">
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                if(window.confirm('Are you sure you want to delete this purchase? This will reduce the stock in inventory.')) {
                                  api.deletePurchase(tx.id).then(() => {
                                    alert('Purchase deleted and stock reverted');
                                    fetchHistory();
                                  }).catch((err) => {
                                    alert('Failed to delete purchase: ' + (err.response?.data?.error || err.message));
                                  });
                                }
                              }}
                              className="text-gray-400 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-400/10" title="Delete Purchase"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))`;

const newTbodyMap = `filteredData.map((tx, index) => (
                      <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-4 py-3 text-gray-300">{index + 1}</td>
                        <td className="px-4 py-3 text-white">
                          <div className="font-medium">{tx.invoice_no || '-'}</div>
                          <div className="text-xs text-gray-500">{tx.purchase_date ? new Date(tx.purchase_date).toLocaleDateString() : ''}</div>
                          <div className="text-xs text-gray-500">{tx.distributor_name}</div>
                        </td>
                        <td className="px-4 py-3 text-primary font-medium">{tx.medicine_name}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{tx.batch_no || '-'}</td>
                        <td className="px-4 py-3 text-white">₹{tx.cost_price?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-3 text-white">₹{tx.mrp?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{tx.packing_type || '-'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{tx.rack || '-'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{(tx.gst_per || 0).toFixed(1)}%</td>
                        <td className="px-4 py-3 text-white font-medium">{tx.quantity || 0}</td>
                        <td className="px-4 py-3 text-white">{tx.free_qty || 0}</td>
                        <td className="px-4 py-3 text-blue-400 font-bold">{tx.total_stock || 0}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEdit(tx.purchase_id)} className="text-gray-400 hover:text-blue-400 transition-colors p-1 rounded hover:bg-blue-400/10" title="Edit Purchase">
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                if(window.confirm('Are you sure you want to delete this purchase? This will reduce the stock in inventory.')) {
                                  api.deletePurchase(tx.purchase_id).then(() => {
                                    alert('Purchase deleted and stock reverted');
                                    fetchHistory();
                                  }).catch((err) => {
                                    alert('Failed to delete purchase: ' + (err.response?.data?.error || err.message));
                                  });
                                }
                              }}
                              className="text-gray-400 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-400/10" title="Delete Purchase"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))`;

content = content.replace(oldTbodyMap, newTbodyMap);

// Replace colSpan=7 with colSpan=13 for loading/empty states
content = content.replace(/colSpan=\{7\}/g, 'colSpan={13}');

fs.writeFileSync(file, content);
console.log('PurchaseHistory.tsx updated successfully.');
