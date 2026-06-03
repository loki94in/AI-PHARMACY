import { useState, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, CheckCircle, Camera, Plus, X, Phone, Calendar, UserCheck } from 'lucide-react';
import AICamera from '../components/AICamera';
import { api } from '../services/api';

const COMMON_COMBINATIONS = [
  { id: 101, name: 'Dolo 650', batch: 'B-D650', expiry: '12/28', mrp: 30.00, costPrice: 20.00, salts: 'Paracetamol 650mg', packSize: 15 },
  { id: 102, name: 'Pantocid 40', batch: 'B-P40', expiry: '05/27', mrp: 45.00, costPrice: 30.00, salts: 'Pantoprazole 40mg', packSize: 10 },
  { id: 103, name: 'Augmentin 625', batch: 'B-A625', expiry: '08/27', mrp: 120.00, costPrice: 80.00, salts: 'Amoxicillin-Clavulanate', packSize: 6 },
  { id: 104, name: 'Darolac Cap', batch: 'B-DRL', expiry: '10/26', mrp: 60.00, costPrice: 40.00, salts: 'Lactobacillus Probiotic', packSize: 10 },
  { id: 105, name: 'Okacet 10mg', batch: 'B-OK10', expiry: '09/27', mrp: 35.00, costPrice: 22.00, salts: 'Cetirizine 10mg', packSize: 10 },
  { id: 106, name: 'Montair LC', batch: 'B-MLC', expiry: '04/28', mrp: 85.00, costPrice: 55.00, salts: 'Montelukast-Levocetirizine', packSize: 15 },
  { id: 107, name: 'Ascoril LS', batch: 'B-ALS', expiry: '11/27', mrp: 95.00, costPrice: 65.00, salts: 'Ambroxol-Levosalbutamol', packSize: 1 },
  { id: 108, name: 'Combiflam', batch: 'B-CFM', expiry: '03/28', mrp: 40.00, costPrice: 25.00, salts: 'Ibuprofen-Paracetamol', packSize: 15 },
];

const POS = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientId] = useState('P-' + Math.floor(100000 + Math.random() * 900000));
  const [refillEnabled, setRefillEnabled] = useState(false);
  const [refillDays, setRefillDays] = useState(30);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [doctor, setDoctor] = useState('');
  const [discount, setDiscount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cart, setCart] = useState<any[]>([]);
  const [sendWhatsApp, setSendWhatsApp] = useState(false); // DEFAULT: OFF
  const [paymentMedium, setPaymentMedium] = useState<string>('CASH'); // DEFAULT: CASH
  const [specialOrders, setSpecialOrders] = useState<any[]>([]);

  // Multi-cart tab states
  const [tabs, setTabs] = useState<any[]>([
    {
      id: 'default',
      name: 'Cart 1',
      items: [],
      patientName: '',
      patientPhone: '',
      refillEnabled: false,
      refillDays: 30,
      doctor: '',
      discount: 0,
      sendWhatsApp: false,
      paymentMedium: 'CASH'
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('default');

  const switchTab = (newTabId: string) => {
    if (newTabId === activeTabId) return;

    // Save current states into active tab first
    setTabs(prev => {
      const updated = prev.map(t => {
        if (t.id === activeTabId) {
          return {
            ...t,
            items: cart,
            patientName,
            patientPhone,
            refillEnabled,
            refillDays,
            doctor,
            discount,
            sendWhatsApp,
            paymentMedium
          };
        }
        return t;
      });

      // Load new active tab states
      const target = updated.find(t => t.id === newTabId);
      if (target) {
        setCart(target.items);
        setPatientName(target.patientName);
        setPatientPhone(target.patientPhone || '');
        setRefillEnabled(target.refillEnabled);
        setRefillDays(target.refillDays);
        setDoctor(target.doctor);
        setDiscount(target.discount);
        setSendWhatsApp(target.sendWhatsApp);
        setPaymentMedium(target.paymentMedium || 'CASH');
        setActiveTabId(newTabId);
      }

      return updated;
    });
  };

  const addNewTab = () => {
    setTabs(prev => {
      const saved = prev.map(t => {
        if (t.id === activeTabId) {
          return {
            ...t,
            items: cart,
            patientName,
            patientPhone,
            refillEnabled,
            refillDays,
            doctor,
            discount,
            sendWhatsApp,
            paymentMedium
          };
        }
        return t;
      });

      const nextNum = saved.length + 1;
      const newId = 'cart_' + Date.now();
      const newTab = {
        id: newId,
        name: `Cart ${nextNum}`,
        items: [],
        patientName: '',
        patientPhone: '',
        refillEnabled: false,
        refillDays: 30,
        doctor: '',
        discount: 0,
        sendWhatsApp: false,
        paymentMedium: 'CASH'
      };

      setCart([]);
      setPatientName('');
      setPatientPhone('');
      setRefillEnabled(false);
      setRefillDays(30);
      setDoctor('');
      setDiscount(0);
      setSendWhatsApp(false);
      setPaymentMedium('CASH');
      setActiveTabId(newId);

      return [...saved, newTab];
    });
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;

    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        const fallback = filtered[filtered.length - 1];
        setCart(fallback.items);
        setPatientName(fallback.patientName);
        setPatientPhone(fallback.patientPhone);
        setRefillEnabled(fallback.refillEnabled);
        setRefillDays(fallback.refillDays);
        setDoctor(fallback.doctor);
        setDiscount(fallback.discount);
        setSendWhatsApp(fallback.sendWhatsApp);
        setPaymentMedium(fallback.paymentMedium || 'CASH');
        setActiveTabId(fallback.id);
      }
      return filtered.map((t, idx) => ({
        ...t,
        name: t.name.startsWith('Cart ') ? `Cart ${idx + 1}` : t.name
      }));
    });
  };

  const getTabItemsCount = (tab: any) => {
    if (tab.id === activeTabId) {
      return cart.length;
    }
    return tab.items.length;
  };

  const updateCart = (newCartOrFn: any[] | ((prev: any[]) => any[])) => {
    setCart(prev => {
      const next = typeof newCartOrFn === 'function' ? newCartOrFn(prev) : newCartOrFn;
      setTabs(prevTabs => prevTabs.map(t => {
        if (t.id === activeTabId) {
          return { ...t, items: next };
        }
        return t;
      }));
      return next;
    });
  };

  const updatePatientName = (name: string) => {
    setPatientName(name);
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return { ...t, patientName: name };
      }
      return t;
    }));
  };
  
  const [doctorsList, setDoctorsList] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [activeRowSearchIndex, setActiveRowSearchIndex] = useState<number | null>(null);
  const [rowSearchTerm, setRowSearchTerm] = useState('');
  const [rowSearchResults, setRowSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (activeRowSearchIndex === null || rowSearchTerm.trim().length < 2) {
      setRowSearchResults([]);
      return;
    }
    
    const delayDebounce = setTimeout(() => {
      api.searchMedicine(rowSearchTerm)
        .then(data => {
          if (Array.isArray(data)) {
            setRowSearchResults(data);
          }
        })
        .catch(err => console.error('Error searching row medicine:', err));
    }, 300);
    
    return () => clearTimeout(delayDebounce);
  }, [rowSearchTerm, activeRowSearchIndex]);

  useEffect(() => {
    api.getDoctors()
      .then(data => {
        if (Array.isArray(data)) {
          setDoctorsList(data);
        }
      })
      .catch(err => console.error('Error fetching doctors:', err));
  }, []);

  useEffect(() => {
    api.getOrders()
      .then(data => {
        if (Array.isArray(data)) {
          const active = data.filter(o => o.status === 'Pending' || o.status === 'Ordered');
          setSpecialOrders(active);
        }
      })
      .catch(err => console.error('Error fetching special orders:', err));
  }, []);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    
    const delayDebounce = setTimeout(() => {
      api.searchMedicine(searchTerm)
        .then(data => {
          if (Array.isArray(data)) {
            setSearchResults(data);
          }
        })
        .catch(err => console.error('Error searching medicines:', err));
    }, 300);
    
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  // Manual Billing Row States
  const [manualName, setManualName] = useState('');
  const [manualBatch, setManualBatch] = useState('');
  const [manualExpiry, setManualExpiry] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [manualLooseQty, setManualLooseQty] = useState(0);
  const [manualPackSize, setManualPackSize] = useState(10);
  const [manualReturn, setManualReturn] = useState(0);
  const [manualMrp, setManualMrp] = useState(0);
  const [manualCostPrice, setManualCostPrice] = useState(0);

  const addToCart = (med: any) => {
    // Check if added item has special order request
    const pendingMatches = specialOrders.filter(
      o => o.product.toLowerCase().trim() === med.name.toLowerCase().trim() ||
           med.name.toLowerCase().includes(o.product.toLowerCase().trim())
    );
    if (pendingMatches.length > 0) {
      alert(`🔔 Pending Out-of-Stock Request:\nCustomer "${pendingMatches[0].requester}" requested ${pendingMatches[0].qty} unit(s) of "${med.name}". Please ensure it is reserved or reconciled if needed!`);
    }

    updateCart(prevCart => {
      const existing = prevCart.find(item => item.id === med.id);
      if (existing) {
        return prevCart.map(item => 
          item.id === med.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prevCart, { 
        id: med.id, 
        name: med.name, 
        batch: med.batch || 'B-GEN', 
        expiry: med.expiry || '12/28', 
        qty: 1, 
        looseQty: 0,
        packSize: med.packSize || 10,
        returnQty: 0, 
        mrp: med.mrp, 
        costPrice: med.costPrice || (med.mrp * 0.7),
        salts: med.salts || '' 
      }];
    });
  };

  const addManualItem = () => {
    if (!manualName.trim()) return;
    
    // Check manual item
    const pendingMatches = specialOrders.filter(
      o => o.product.toLowerCase().trim() === manualName.toLowerCase().trim() ||
           manualName.toLowerCase().includes(o.product.toLowerCase().trim())
    );
    if (pendingMatches.length > 0) {
      alert(`🔔 Pending Out-of-Stock Request:\nCustomer "${pendingMatches[0].requester}" requested ${pendingMatches[0].qty} unit(s) of "${manualName}".`);
    }
    
    const newItem = {
      id: Date.now(),
      name: manualName.trim(),
      batch: manualBatch.trim() || 'MANUAL',
      expiry: manualExpiry.trim() || '12/28',
      qty: manualQty,
      looseQty: manualLooseQty,
      packSize: manualPackSize,
      returnQty: manualReturn,
      mrp: manualMrp,
      costPrice: manualCostPrice || (manualMrp * 0.7),
      salts: 'Custom Manual Entry'
    };
    
    updateCart(prev => [...prev, newItem]);
    
    // Reset manual input fields
    setManualName('');
    setManualBatch('');
    setManualExpiry('');
    setManualQty(1);
    setManualLooseQty(0);
    setManualPackSize(10);
    setManualReturn(0);
    setManualMrp(0);
    setManualCostPrice(0);
  };

  const removeFromCart = (id: number) => {
    updateCart(prevCart => prevCart.filter(item => item.id !== id));
  };

  const changeRowMedicine = (index: number, med: any) => {
    updateCart(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      return {
        ...item,
        id: med.inventory_id,
        name: med.medicine_name,
        batch: med.batch_no,
        expiry: med.expiry_date,
        mrp: med.mrp,
        costPrice: med.cost_price,
        salts: med.salts || med.hsn_code || 'Generic',
        packSize: med.pack_size || 10
      };
    }));
    setActiveRowSearchIndex(null);
    setRowSearchTerm('');
    setRowSearchResults([]);
  };

  const updateCartItem = (id: number, field: string, value: any) => {
    updateCart(prevCart => prevCart.map(item => {
      if (item.id !== id) return item;
      
      let updatedItem = { ...item, [field]: value };
      
      if (field === 'looseQty') {
        const looseVal = Math.max(0, Number(value));
        const pSize = updatedItem.packSize || 10;
        if (looseVal >= pSize) {
          const extraStrips = Math.floor(looseVal / pSize);
          updatedItem.qty = (updatedItem.qty || 0) + extraStrips;
          updatedItem.looseQty = looseVal % pSize;
        } else {
          updatedItem.looseQty = looseVal;
        }
      }

      if (field === 'packSize') {
        const pSize = Math.max(1, Number(value));
        updatedItem.packSize = pSize;
        const looseVal = updatedItem.looseQty || 0;
        if (looseVal >= pSize) {
          const extraStrips = Math.floor(looseVal / pSize);
          updatedItem.qty = (updatedItem.qty || 0) + extraStrips;
          updatedItem.looseQty = looseVal % pSize;
        }
        
        // Trigger global SQLite database update for pack size if it is a saved inventory item
        if (typeof id === 'number' && id < 1000000) {
          api.updateMedicine(id, { pack_size: String(pSize) })
            .catch(err => console.error('Error updating pack size in DB:', err));
        }
      }

      if (field === 'mrp' && typeof id === 'number' && id < 1000000) {
        api.updateMedicine(id, { mrp: Number(value) })
          .catch(err => console.error('Error updating MRP in DB:', err));
      }

      if (field === 'costPrice' && typeof id === 'number' && id < 1000000) {
        api.updateMedicine(id, { purchase_price: Number(value) })
          .catch(err => console.error('Error updating Cost Price in DB:', err));
      }
      
      return updatedItem;
    }));
  };

  const clearCart = () => {
    updateCart([]);
  };

  const handleScanResult = (result: any) => {
    // Populate the search bar with the best guess name
    if (result.medicineInfo && result.medicineInfo.potentialName) {
      setSearchTerm(result.medicineInfo.potentialName);
    } else if (result.text) {
      // Fallback to first line of raw text
      const firstLine = result.text.split('\n')[0];
      setSearchTerm(firstLine || '');
    }
    setShowCamera(false);
  };
  
  // Calculations
  const subtotal = cart.reduce((sum, item) => {
    const unitRate = item.packSize > 0 ? item.mrp / item.packSize : item.mrp;
    return sum + (item.mrp * item.qty) + (unitRate * (item.looseQty || 0)) - (unitRate * (item.returnQty || 0));
  }, 0);
  
  const discountAmount = subtotal * (discount / 100);
  const grandTotal = Math.round(subtotal - discountAmount);

  const totalCost = cart.reduce((sum, item) => {
    const itemCost = item.costPrice != null ? item.costPrice : (item.mrp * 0.7);
    const unitCostRate = item.packSize > 0 ? itemCost / item.packSize : itemCost;
    return sum + (itemCost * item.qty) + (unitCostRate * (item.looseQty || 0)) - (unitCostRate * (item.returnQty || 0));
  }, 0);

  const profitOrLoss = grandTotal - totalCost;
  const isLoss = cart.length > 0 && profitOrLoss < -0.001; // Loss greater than 0.1 paise

  const handleCompleteSale = async () => {
    if (cart.length === 0 || isLoss) return;

    if (paymentMedium === 'CREDIT' && !patientName.trim()) {
      alert('Patient/Customer Name is required for Credit transactions to track outstanding balance!');
      return;
    }
    
    try {
      const salesItems = cart.map(item => {
        const unitRate = item.packSize > 0 ? item.mrp / item.packSize : item.mrp;
        return {
          inventoryId: typeof item.id === 'number' && item.id < 1000000 ? item.id : undefined,
          medicineName: item.name,
          batchNo: item.batch,
          expiryDate: item.expiry,
          mrp: item.mrp,
          quantity: item.qty + (item.looseQty / (item.packSize || 10)) - (item.returnQty / (item.packSize || 10)),
          unitPrice: unitRate
        };
      });

      const payload = {
        items: salesItems,
        discount: discountAmount,
        patientName: patientName || 'Walk-in Customer',
        patientPhone: patientPhone,
        doctorId: doctor ? Number(doctor) || undefined : undefined,
        paymentMedium: paymentMedium,
        paymentStatus: paymentMedium === 'CREDIT' ? 'UNPAID' : 'PAID',
        sendWhatsApp: sendWhatsApp
      };

      const result = await api.createSale(payload);
      alert(`Sale completed successfully! Invoice ${result.invoiceNo || 'SUCCESS'} logged. Grand Total: ₹${grandTotal}`);
      
      // Clear cart and states
      updateCart([]);
      setPatientName('');
      setPatientPhone('');
      setDoctor('');
      setDiscount(0);
      setPaymentMedium('CASH');
      setTabs(prev => prev.map(t => {
        if (t.id === activeTabId) {
          return {
            ...t,
            items: [],
            patientName: '',
            patientPhone: '',
            refillEnabled: false,
            refillDays: 30,
            doctor: '',
            discount: 0,
            sendWhatsApp: false,
            paymentMedium: 'CASH'
          };
        }
        return t;
      }));
    } catch (error) {
      console.error('Error completing sale:', error);
      alert('Failed to save sale to database. Please check connection.');
    }
  };

  return (
    <div className="h-full flex flex-col fade-in space-y-4 overflow-hidden pb-4">
      {/* Patient & Transaction Bar (All in One Horizontal Line) */}
      <div className="glass-panel p-3 flex flex-wrap items-center justify-between gap-3 bg-white/5 border-glass-border text-xs">
        {/* Patient Name Group */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
          <span className="font-bold text-muted whitespace-nowrap">👤 Pt:</span>
          <input 
            type="text" 
            className="premium-input text-xs py-1 px-2 w-full max-w-[130px]" 
            placeholder="Walk-in Customer" 
            value={patientName}
            onChange={e => updatePatientName(e.target.value)}
            aria-label="Patient Name"
          />
          <button 
            onClick={() => setShowPatientModal(true)}
            className="p-1 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary transition-all flex items-center justify-center"
            title="Manage Patient Profile & Refills"
          >
            <Plus size={12} className="stroke-[3]" />
          </button>
        </div>

        {/* Phone Number Group */}
        <div className="flex items-center gap-1.5 min-w-[160px]">
          <span className="font-bold text-muted whitespace-nowrap">📞 No:</span>
          <input 
            type="text" 
            className="premium-input text-xs py-1 px-2 w-28 font-mono text-text" 
            placeholder="9876543210"
            value={patientPhone}
            onChange={e => setPatientPhone(e.target.value)}
            aria-label="Phone Number"
          />
        </div>

        {/* Doctor Dropdown Group */}
        <div className="flex items-center gap-1.5 min-w-[180px]">
          <span className="font-bold text-muted whitespace-nowrap">🥼 Dr:</span>
          <select 
            className="premium-input text-xs py-1 px-2 bg-bg2 w-full max-w-[130px]" 
            value={doctor}
            onChange={e => setDoctor(e.target.value)}
            title="Select Doctor"
          >
            <option value="">-- General --</option>
            {doctorsList.length === 0 ? (
              <>
                <option value="Dr. Priya Mehta (Cardiologist)">Dr. Priya Mehta</option>
                <option value="Dr. Raj Sharma (GP)">Dr. Raj Sharma</option>
                <option value="Dr. Anita Patel (Pediatrician)">Dr. Anita Patel</option>
              </>
            ) : (
              doctorsList.map(doc => (
                <option key={doc.id} value={doc.id}>{doc.name}</option>
              ))
            )}
          </select>
        </div>

        {/* WhatsApp ON/OFF Switch */}
        <div className="flex items-center gap-1.5 min-w-[90px]">
          <button 
            onClick={() => setSendWhatsApp(!sendWhatsApp)}
            className={`h-7 px-2.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all select-none ${
              sendWhatsApp 
                ? 'bg-green/10 border-green/30 text-green hover:bg-green/20 shadow-[0_2px_8px_rgba(16,185,129,0.15)] font-extrabold' 
                : 'bg-white/5 border-glass-border text-muted hover:text-text hover:bg-white/10'
            }`}
            title={sendWhatsApp ? "WhatsApp Active" : "WhatsApp Inactive"}
          >
            {sendWhatsApp ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-green animate-ping" />
                <span>WA: ON</span>
              </>
            ) : (
              <span>WA: OFF</span>
            )}
          </button>
        </div>

        {/* Date Stamp Group */}
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-muted whitespace-nowrap">📅:</span>
          <input 
            type="date" 
            className="premium-input text-xs py-1 px-2 text-text w-28" 
            value={date}
            onChange={e => setDate(e.target.value)}
            aria-label="Transaction Date"
          />
        </div>
      </div>

      {/* Search Medicine Section */}
      <div className="glass-panel p-4 flex flex-col gap-3.5 bg-white/5 border-glass-border">
        <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-4">
          <h3 className="font-bold flex items-center gap-2 text-base whitespace-nowrap">
            <Search size={18} className="text-primary" /> 
            Search Medicine
          </h3>
          <div className="flex-1 flex gap-4 max-w-3xl w-full">
            <div className="relative flex-1">
              <input 
                type="text" 
                placeholder="Search medicine by name, batch, composition, or MRP..." 
                className="premium-input w-full text-base p-2.5"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              
              {/* Search results dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1.5 bg-[#18181b]/95 backdrop-blur border border-glass-border rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                  <div className="p-2 border-b border-glass-border/30 bg-black/20 text-[10px] font-bold text-muted uppercase tracking-wider">
                    Matching Inventory Batch Records:
                  </div>
                  <div className="flex flex-col">
                    {searchResults.map((med: any) => {
                      const pendingMatches = specialOrders.filter(
                        o => o.product.toLowerCase().trim() === med.medicine_name.toLowerCase().trim() ||
                             med.medicine_name.toLowerCase().includes(o.product.toLowerCase().trim())
                      );
                      const hasPending = pendingMatches.length > 0;
                      return (
                        <button
                          key={med.inventory_id}
                          type="button"
                          onClick={() => {
                            addToCart({
                              id: med.inventory_id,
                              name: med.medicine_name,
                              batch: med.batch_no,
                              expiry: med.expiry_date,
                              mrp: med.mrp,
                              costPrice: med.cost_price,
                              salts: med.salts || med.hsn_code || 'Generic',
                              packSize: med.pack_size || 10
                            });
                            setSearchTerm('');
                            setSearchResults([]);
                          }}
                          className="flex items-center justify-between p-2.5 hover:bg-white/5 border-b border-glass-border/10 text-left transition-all text-xs w-full group"
                        >
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-text group-hover:text-primary transition-all">{med.medicine_name}</span>
                              {hasPending && (
                                <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 px-1.5 py-0.5 rounded text-[9px] font-bold animate-pulse">
                                  ⚠️ Request: {pendingMatches[0].requester} ({pendingMatches[0].qty})
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] text-muted">Batch: <span className="font-mono text-text">{med.batch_no}</span> | Exp: <span className="font-mono text-text">{med.expiry_date}</span></span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="font-mono text-sky font-bold">MRP: ₹{med.mrp.toFixed(2)}</div>
                              <div className="text-[9px] text-muted">Stock: {med.quantity} units</div>
                            </div>
                            <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary py-1 px-2.5 rounded-lg font-bold group-hover:bg-primary group-hover:text-text transition-all">+ Add</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <button 
              type="button"
              onClick={() => setShowCamera(true)}
              className="premium-btn bg-black/40 border border-primary/30 text-primary hover:bg-primary/20 transition-all flex items-center gap-2 px-6"
            >
              <Camera size={20} />
              <span>AI Scan</span>
            </button>
          </div>
        </div>

        {/* Quick Add / Common Combinations scrolling pills */}
        <div className="border-t border-glass-border/30 pt-3 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5 select-none">
            ⚡ Quick-Add Combinations (Most Sold prescription bundles):
          </span>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {COMMON_COMBINATIONS.map(med => (
              <button
                key={med.id}
                onClick={() => addToCart(med)}
                className="flex flex-col items-start bg-white/5 border border-glass-border/50 hover:border-primary/40 hover:bg-primary/5 p-2 rounded-xl transition-all min-w-[150px] text-left group"
              >
                <div className="text-xs font-bold text-text group-hover:text-primary transition-all flex items-center justify-between w-full">
                  <span>{med.name}</span>
                  <span className="text-[10px] text-primary opacity-60 group-hover:opacity-100 font-bold">+ Add</span>
                </div>
                <div className="text-[9px] text-muted truncate w-full mt-0.5">{med.salts}</div>
                <div className="text-[9px] font-mono text-sky mt-1">₹{med.mrp.toFixed(2)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart & Actions Grid (75% / 25% Split Column Layout) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-hidden">
        {/* LEFT: CART TABLE (75% / 3/4 Column Width) */}
        <div className="lg:col-span-3 glass-panel flex flex-col overflow-hidden bg-white/5 border-glass-border">
          <div className="p-2 border-b border-glass-border flex flex-wrap items-center justify-between gap-3 bg-black/10">
            <div className="flex items-center gap-2 overflow-x-auto max-w-full no-scrollbar py-0.5">
              {tabs.map((t) => {
                const isActive = t.id === activeTabId;
                const count = getTabItemsCount(t);
                const displayName = t.patientName.trim() ? `Pt: ${t.patientName}` : t.name;
                return (
                  <div
                    key={t.id}
                    onClick={() => switchTab(t.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-semibold text-xs transition-all select-none cursor-pointer ${
                      isActive 
                        ? 'bg-primary/20 border-primary text-primary shadow-[0_0_12px_rgba(14,165,233,0.15)] font-bold' 
                        : 'bg-white/5 border-glass-border text-muted hover:text-text hover:bg-white/10'
                    }`}
                  >
                    <ShoppingCart size={12} className={isActive ? 'text-primary' : 'text-muted'} />
                    <span>{displayName} ({count})</span>
                    {tabs.length > 1 && (
                      <span 
                        onClick={(e) => closeTab(t.id, e)}
                        className="hover:bg-white/15 rounded-full p-0.5 ml-1 transition-all cursor-pointer flex items-center justify-center text-muted hover:text-text"
                        title="Close Cart"
                      >
                        <X size={10} />
                      </span>
                    )}
                  </div>
                );
              })}
              <button
                onClick={addNewTab}
                className="flex items-center justify-center p-1.5 rounded-lg border border-dashed border-glass-border text-muted hover:text-text hover:border-text transition-all bg-white/5 hover:bg-white/10 h-[30px] w-[30px]"
                title="Add New Cart"
              >
                <Plus size={14} />
              </button>
            </div>
            
            <button 
              onClick={clearCart}
              className="premium-btn bg-red/10 border border-red/20 text-red text-xs py-1.5 px-3 hover:bg-red/25 transition-all flex items-center gap-1.5 ml-auto"
            >
              <Trash2 size={12} /> Clear Cart
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
                <tr>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Medicine</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Batch</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">Expiry</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">Pack Size</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">Qty (Str)</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">Loose (Qty)</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">Return</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-right">MRP / Unit Price</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-right">Total</th>
                  <th className="p-3 text-xs font-bold text-muted tracking-wider border-b border-glass-border"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map(item => {
                  const unitRate = item.packSize > 0 ? item.mrp / item.packSize : item.mrp;
                  const itemTotal = (item.mrp * item.qty) + (unitRate * (item.looseQty || 0)) - (unitRate * (item.returnQty || 0));
                  return (
                    <tr key={item.id} className="border-b border-glass-border/20 hover:bg-white/5 transition-all">
                      {/* Medicine Name (Changeable Autocomplete Search) */}
                      <td className="p-2 min-w-[150px] relative">
                        <div className="relative">
                          <input 
                            type="text" 
                            className="w-full bg-transparent border-0 border-b border-transparent hover:border-glass-border/30 focus:border-primary/40 focus:ring-0 text-xs font-semibold text-text ml-1.5 py-0.5"
                            value={activeRowSearchIndex === cart.indexOf(item) ? rowSearchTerm : item.name}
                            onChange={e => {
                              const val = e.target.value;
                              const idx = cart.indexOf(item);
                              setActiveRowSearchIndex(idx);
                              setRowSearchTerm(val);
                            }}
                            onFocus={() => {
                              const idx = cart.indexOf(item);
                              setActiveRowSearchIndex(idx);
                              setRowSearchTerm(item.name);
                            }}
                            placeholder="Change medicine..."
                          />
                          
                          {activeRowSearchIndex === cart.indexOf(item) && rowSearchResults.length > 0 && (
                            <div className="absolute left-0 right-0 z-50 mt-1 bg-[#18181b]/98 backdrop-blur border border-glass-border rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto w-64">
                              {rowSearchResults.map((med: any) => {
                                const rowPendingMatches = specialOrders.filter(
                                  o => o.product.toLowerCase().trim() === med.medicine_name.toLowerCase().trim() ||
                                       med.medicine_name.toLowerCase().includes(o.product.toLowerCase().trim())
                                );
                                const rowHasPending = rowPendingMatches.length > 0;
                                return (
                                  <button
                                    key={med.inventory_id}
                                    type="button"
                                    onClick={() => {
                                      const idx = cart.indexOf(item);
                                      changeRowMedicine(idx, med);
                                    }}
                                    className="flex flex-col p-2 hover:bg-white/5 border-b border-glass-border/10 text-left transition-all text-xs w-full"
                                  >
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-text">{med.medicine_name}</span>
                                      {rowHasPending && (
                                        <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 px-1 py-0.5 rounded text-[8px] font-bold animate-pulse">
                                          ⚠️ {rowPendingMatches[0].requester} ({rowPendingMatches[0].qty})
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[9px] text-muted font-mono mt-0.5">Batch: {med.batch_no} | Exp: {med.expiry_date}</span>
                                    <span className="text-[9px] text-sky font-bold font-mono mt-0.5">MRP: ₹{med.mrp.toFixed(2)} | Stock: {med.quantity}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="text-[9px] text-muted ml-1.5 mt-0.5 truncate max-w-[160px]">{item.salts || 'Generic Salts'}</div>
                      </td>

                      {/* Batch */}
                      <td className="p-2 select-none">
                        <div className="font-mono text-xs font-semibold text-text ml-1 bg-white/5 px-2 py-1 rounded border border-glass-border/30 inline-block">{item.batch}</div>
                      </td>
                      
                      {/* Expiry */}
                      <td className="p-2 text-center select-none">
                        <div className="font-mono text-xs font-semibold text-text bg-white/5 px-2 py-1 rounded border border-glass-border/30 inline-block">{item.expiry}</div>
                      </td>

                      {/* Pack Size */}
                      <td className="p-2 text-center">
                        <input 
                          type="number" 
                          className="premium-input text-xs py-1 px-1.5 w-10 text-center font-mono text-slate-400 bg-white/5 border-glass-border/60" 
                          value={item.packSize || 10}
                          onChange={e => updateCartItem(item.id, 'packSize', Math.max(1, Number(e.target.value)))}
                          min="1"
                        />
                      </td>

                      {/* Quantity - Full Strips */}
                      <td className="p-2 text-center">
                        <input 
                          type="number" 
                          className="premium-input text-xs py-1 px-1.5 w-10 text-center font-mono font-bold text-text bg-white/5 border-glass-border/60" 
                          value={item.qty}
                          onChange={e => updateCartItem(item.id, 'qty', Math.max(0, Number(e.target.value)))}
                          min="0"
                        />
                      </td>

                      {/* Quantity - Loose Units */}
                      <td className="p-2 text-center">
                        <input 
                          type="number" 
                          className="premium-input text-xs py-1 px-1.5 w-10 text-center font-mono font-bold border-amber-500/30 focus:border-amber-500 bg-amber-500/5 text-amber-200" 
                          value={item.looseQty || 0}
                          onChange={e => updateCartItem(item.id, 'looseQty', Math.max(0, Number(e.target.value)))}
                          min="0"
                        />
                      </td>

                      {/* Return Qty */}
                      <td className="p-2 text-center">
                        <input 
                          type="number" 
                          className="premium-input text-xs py-1 px-1.5 w-10 text-center font-mono font-bold text-text bg-white/5 border-glass-border/60" 
                          value={item.returnQty || 0}
                          onChange={e => updateCartItem(item.id, 'returnQty', Math.max(0, Number(e.target.value)))}
                          min="0"
                        />
                      </td>

                      {/* MRP / Unit Rate display */}
                      <td className="p-2 text-right font-mono text-xs">
                        <div className="flex flex-col gap-1 items-end">
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-[9px] text-muted">MRP:</span>
                            <input 
                              type="number" 
                              className="premium-input text-xs font-mono py-0.5 px-1 w-14 text-right bg-white/5 border-glass-border/60 inline-block" 
                              value={item.mrp || ''}
                              placeholder="0.00"
                              onChange={e => updateCartItem(item.id, 'mrp', Math.max(0, Number(e.target.value)))}
                            />
                          </div>
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-[9px] text-muted">Cost:</span>
                            <input 
                              type="number" 
                              className="premium-input text-xs font-mono py-0.5 px-1 w-14 text-right bg-white/5 border-glass-border/60 inline-block text-slate-400" 
                              value={item.costPrice != null ? item.costPrice : (item.mrp * 0.7)}
                              placeholder="0.00"
                              onChange={e => updateCartItem(item.id, 'costPrice', Math.max(0, Number(e.target.value)))}
                            />
                          </div>
                          <div className="text-[9px] text-amber-500/80 mt-0.5">₹{unitRate.toFixed(2)}/Tab</div>
                        </div>
                      </td>

                      <td className="p-2 text-right text-xs font-mono font-bold text-primary">
                        ₹{itemTotal.toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        <button 
                          onClick={() => removeFromCart(item.id)}
                          className="p-1 hover:bg-red/10 text-muted hover:text-red rounded-lg transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* MANUAL BILLING ROW AT THE BOTTOM */}
                <tr className="bg-white/5 border-t-2 border-primary/20 hover:bg-white/10 transition-all">
                  <td className="p-2">
                    <input 
                      type="text" 
                      placeholder="Add New Medicine..." 
                      className="premium-input text-xs py-1 px-2 w-full border-primary/30 text-text bg-white/5 font-semibold placeholder:text-muted" 
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  <td className="p-2">
                    <input 
                      type="text" 
                      placeholder="Batch" 
                      className="premium-input text-xs font-mono py-1 px-1.5 w-full bg-white/5" 
                      value={manualBatch}
                      onChange={e => setManualBatch(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input 
                      type="text" 
                      placeholder="MM/YY" 
                      className="premium-input text-xs font-mono py-1 px-1.5 w-12 text-center bg-white/5" 
                      value={manualExpiry}
                      onChange={e => setManualExpiry(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input 
                      type="number" 
                      className="premium-input text-xs font-mono py-1 px-1.5 w-10 text-center font-bold bg-white/5" 
                      value={manualPackSize}
                      onChange={e => setManualPackSize(Math.max(1, Number(e.target.value)))}
                      min="1"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input 
                      type="number" 
                      className="premium-input text-xs font-mono py-1 px-1.5 w-10 text-center font-bold bg-white/5" 
                      value={manualQty}
                      onChange={e => setManualQty(Math.max(0, Number(e.target.value)))}
                      min="0"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input 
                      type="number" 
                      className="premium-input text-xs font-mono py-1 px-1.5 w-10 text-center font-bold bg-white/5 text-amber-200 border-amber-500/30" 
                      value={manualLooseQty}
                      onChange={e => setManualLooseQty(Math.max(0, Number(e.target.value)))}
                      min="0"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input 
                      type="number" 
                      className="premium-input text-xs font-mono py-1 px-1.5 w-10 text-center font-bold bg-white/5" 
                      value={manualReturn}
                      onChange={e => setManualReturn(Math.max(0, Number(e.target.value)))}
                      min="0"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col gap-1 items-end">
                      <input 
                        type="number" 
                        placeholder="MRP"
                        className="premium-input text-xs font-mono py-0.5 px-1 w-14 text-right bg-white/5" 
                        value={manualMrp || ''}
                        onChange={e => {
                          const val = Math.max(0, Number(e.target.value));
                          setManualMrp(val);
                          setManualCostPrice(prev => prev === 0 || prev === manualMrp * 0.7 ? val * 0.7 : prev);
                        }}
                        min="0"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                      />
                      <input 
                        type="number" 
                        placeholder="Cost"
                        className="premium-input text-xs font-mono py-0.5 px-1 w-14 text-right bg-white/5 text-slate-400" 
                        value={manualCostPrice || ''}
                        onChange={e => setManualCostPrice(Math.max(0, Number(e.target.value)))}
                        min="0"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                      />
                    </div>
                  </td>
                  <td className="p-2 text-right text-xs font-mono font-bold text-sky">
                    ₹{((manualMrp * manualQty) + ((manualPackSize > 0 ? manualMrp / manualPackSize : manualMrp) * (manualLooseQty - manualReturn))).toFixed(2)}
                  </td>
                  <td className="p-2 text-center">
                    <button 
                      onClick={addManualItem}
                      disabled={!manualName.trim()}
                      className={`p-1.5 rounded-lg border flex items-center justify-center transition-all ${!manualName.trim() ? 'bg-white/5 border-glass-border text-muted cursor-not-allowed' : 'bg-primary/20 border-primary text-primary hover:bg-primary/30'}`}
                      title="Add Custom Medicine Row"
                    >
                      <Plus size={14} className="stroke-[3]" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3.5 border-t border-glass-border bg-black/40 flex flex-wrap items-center justify-between gap-4">
             {/* Calculations readout */}
             <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-muted">
                <div>
                  Subtotal: <span className="font-mono text-sm text-text ml-1">₹{subtotal.toFixed(2)}</span>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <span>Disc %:</span>
                  <input 
                    type="number" 
                    className="premium-input text-xs py-0.5 px-1.5 w-12 text-right font-mono" 
                    value={discount}
                    onChange={e => setDiscount(Number(e.target.value))}
                    min="0"
                    max="100"
                    aria-label="Discount Percentage"
                  />
                </div>
                
                {discount > 0 && (
                  <div className="text-green font-bold">
                    Saved: -₹{discountAmount.toFixed(2)}
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <span>Pay Via:</span>
                  <select 
                    className="premium-input text-xs py-0.5 px-1.5 bg-[#18181b]/50 border-glass-border font-bold text-text cursor-pointer"
                    value={paymentMedium}
                    onChange={e => setPaymentMedium(e.target.value)}
                    aria-label="Payment Method"
                  >
                    <option value="CASH" className="bg-[#18181b] text-text font-semibold">💵 Cash</option>
                    <option value="UPI" className="bg-[#18181b] text-text font-semibold">📱 UPI / QR</option>
                    <option value="CREDIT" className="bg-[#18181b] text-text font-semibold text-amber-300">💳 Credit (Khata)</option>
                  </select>
                </div>
                
                <div className="text-sm font-extrabold text-sky">
                  Grand Total: <span className="font-mono text-base ml-1">₹{grandTotal}</span>
                </div>

                {cart.length > 0 && (
                  <div className={`px-2.5 py-1 rounded-lg border font-bold text-xs flex items-center gap-1.5 transition-all select-none ${
                    isLoss 
                      ? 'bg-red/10 border-red/30 text-red animate-pulse font-extrabold shadow-[0_0_12px_rgba(239,68,68,0.15)]' 
                      : 'bg-green/10 border-green/30 text-green font-extrabold shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  }`}>
                    {isLoss ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-red animate-ping" />
                        <span>⚠️ LOSS ALERT (-₹{Math.abs(profitOrLoss).toFixed(2)})</span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
                        <span>📈 PROFIT (+₹{profitOrLoss.toFixed(2)})</span>
                      </>
                    )}
                  </div>
                )}
             </div>

             {/* Action trigger button */}
             <button 
               onClick={handleCompleteSale}
               disabled={cart.length === 0 || isLoss}
               className={`premium-btn text-white py-2 px-6 text-sm flex items-center gap-2 font-bold uppercase tracking-wider rounded-xl transition-all ${
                 cart.length === 0 
                   ? 'bg-white/5 border border-glass-border text-muted cursor-not-allowed' 
                   : isLoss
                     ? 'bg-red/15 border border-red/30 text-red hover:bg-red/25 cursor-not-allowed shadow-[inset_0_0_10px_rgba(239,68,68,0.1)]'
                     : 'bg-green hover:bg-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.35)]'
               }`}
             >
               <CheckCircle size={16} /> Complete Sale
             </button>
          </div>
        </div>

        {/* RIGHT COLUMN: AI SCANNER & DOCTOR SUGGESTIONS (25% / 1/4 Column Width, Equal-Height Alignment) */}
        <div className="flex flex-col gap-4 overflow-hidden lg:col-span-1">
          {/* AI Camera Preview widget */}
          <div className="glass-panel p-4 flex flex-col bg-white/5 border-glass-border flex-1">
            <h3 className="font-bold flex items-center gap-2 mb-3 text-sm text-text">
              <Camera size={16} className="text-green" />
              AI Scanner Preview
            </h3>
            <div className="relative w-full flex-1 bg-black/50 border border-glass-border rounded-xl flex flex-col items-center justify-center gap-2 overflow-hidden select-none min-h-[140px]">
              <Camera className="text-green opacity-80 animate-pulse" size={24} />
              <span className="text-xs text-muted font-mono uppercase">AI camera preview active</span>
            </div>
          </div>

          {/* Doctor suggestions widget */}
          <div className="glass-panel p-4 flex flex-col bg-white/5 border-glass-border flex-1">
            <h3 className="font-bold flex items-center gap-2 mb-3 text-sm text-text">
              <UserCheck size={16} className="text-primary" />
              🥼 Dr. Suggestions
            </h3>
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-[140px] justify-center">
              {doctor ? (
                <div className="space-y-2">
                  <button 
                    onClick={() => addToCart({ id: 101, name: 'Dolo 650', mrp: 30.00, costPrice: 20.00, salts: 'Paracetamol 650mg', packSize: 15 })}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-white/5 border border-glass-border/40 hover:border-primary/40 hover:bg-primary/5 text-left text-xs transition-all"
                  >
                    <div>
                      <span className="font-semibold block text-text">Dolo 650</span>
                      <span className="text-[9px] text-muted">Co-prescribed (94% match)</span>
                    </div>
                    <span className="text-[10px] text-primary font-bold">+ Add</span>
                  </button>
                  <button 
                    onClick={() => addToCart({ id: 105, name: 'Okacet 10mg', mrp: 35.00, costPrice: 22.00, salts: 'Cetirizine 10mg', packSize: 10 })}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-white/5 border border-glass-border/40 hover:border-primary/40 hover:bg-primary/5 text-left text-xs transition-all"
                  >
                    <div>
                      <span className="font-semibold block text-text">Okacet 10mg</span>
                      <span className="text-[9px] text-muted">Co-prescribed (82% match)</span>
                    </div>
                    <span className="text-[10px] text-primary font-bold">+ Add</span>
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted text-center italic">Select a doctor to view companion recommendations</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCamera && (
        <AICamera 
          onClose={() => setShowCamera(false)} 
          onScanResult={handleScanResult} 
        />
      )}

      {/* Patient Profile & Auto-Refills Modal */}
      {showPatientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-panel max-w-md w-full p-6 space-y-5 border-glass-border bg-[#18181b]/95 shadow-2xl rounded-2xl relative">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-glass-border pb-3">
              <h3 className="font-bold flex items-center gap-2 text-lg text-text">
                <UserCheck size={20} className="text-primary" />
                Manage Patient & Refills
              </h3>
              <button 
                onClick={() => setShowPatientModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-muted hover:text-text transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4">
              {/* Patient ID */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-muted uppercase tracking-wider">Patient Card ID</span>
                <input 
                  type="text" 
                  className="premium-input w-full text-xs font-mono py-2 px-3 bg-white/5 cursor-not-allowed" 
                  value={patientId}
                  disabled
                  title="Auto-generated unique card ID"
                />
              </div>

              {/* Patient Name */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-muted uppercase tracking-wider">Full Name</span>
                <input 
                  type="text" 
                  className="premium-input w-full text-sm py-2 px-3" 
                  placeholder="Enter full name" 
                  value={patientName}
                  onChange={e => updatePatientName(e.target.value)}
                />
              </div>

              {/* WhatsApp / Phone */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={12} className="text-green" /> WhatsApp / Contact Number
                </span>
                <input 
                  type="text" 
                  className="premium-input w-full text-sm font-mono py-2 px-3" 
                  placeholder="e.g. 9130558910" 
                  value={patientPhone}
                  onChange={e => setPatientPhone(e.target.value)}
                />
              </div>

              {/* Auto-Refill Manager Section */}
              <div className="border border-glass-border rounded-xl p-4 bg-white/5 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                      🔄 Auto-Refill Reminders
                    </span>
                    <p className="text-[10px] text-muted">Generate recurring WhatsApp stock notifications</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer" aria-label="Toggle Refill">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={refillEnabled}
                      onChange={e => setRefillEnabled(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted after:border-glass-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-checked:after:bg-text"></div>
                  </label>
                </div>

                {refillEnabled && (
                  <div className="space-y-3 pt-2 border-t border-glass-border/40 animate-fade-in">
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1">
                        <Calendar size={12} /> Refill Interval (Days)
                      </span>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          className="premium-input text-sm font-mono py-1.5 px-3 w-20 text-center" 
                          value={refillDays}
                          onChange={e => setRefillDays(Math.max(1, Number(e.target.value)))}
                          min="1"
                        />
                        <div className="flex gap-1 flex-1">
                          {[30, 60, 90].map(days => (
                            <button
                              key={days}
                              onClick={() => setRefillDays(days)}
                              className={`text-xs py-1 px-2.5 rounded-lg border font-mono transition-all flex-1 ${refillDays === days ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-glass-border text-muted hover:text-text'}`}
                            >
                              {days}d
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-glass-border flex justify-end gap-3">
              <button 
                onClick={() => setShowPatientModal(false)}
                className="premium-btn bg-white/5 border border-glass-border text-muted hover:text-text hover:bg-white/10 py-2 px-4 text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
              <button 
                onClick={() => setShowPatientModal(false)}
                className="premium-btn bg-primary text-text shadow-[0_4px_12px_rgba(20,184,166,0.3)] hover:bg-teal-500 py-2 px-5 text-xs font-bold uppercase tracking-wider"
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
