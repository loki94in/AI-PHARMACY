import { useState, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, CheckCircle, Camera, Plus, X, Phone, Calendar, UserCheck } from 'lucide-react';
import AICamera from '../components/AICamera';
import BrandBanner from '../components/POS/BrandBanner';
import { api } from '../services/api';

// We will fetch common combinations dynamically instead of using hardcoded constants

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
  const [isDoctorDropdownOpen, setIsDoctorDropdownOpen] = useState(false);
  const [doctorHighlightIndex, setDoctorHighlightIndex] = useState(-1);
  const [isManualDoctor, setIsManualDoctor] = useState(false);
  
  // Doctor Modal state
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [newDoctorName, setNewDoctorName] = useState('');
  const [newDoctorSpecialty, setNewDoctorSpecialty] = useState('');
  const [newDoctorPhone, setNewDoctorPhone] = useState('');
  const [newDoctorClinic, setNewDoctorClinic] = useState('');
  const [newDoctorRegNo, setNewDoctorRegNo] = useState('');
  // Patient autocomplete
  const [patientSuggestions, setPatientSuggestions] = useState<any[]>([]);
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);
  const [patientHighlightIndex, setPatientHighlightIndex] = useState(-1);
  const [discount, setDiscount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cart, setCart] = useState<any[]>([]);
  const [sendWhatsApp, setSendWhatsApp] = useState(false); // DEFAULT: OFF
  const [paymentMedium, setPaymentMedium] = useState<string>('CASH'); // DEFAULT: CASH
  const [specialOrders, setSpecialOrders] = useState<any[]>([]);
  const [rowBatchesList, setRowBatchesList] = useState<any[]>([]);
  const [activeBatchRowId, setActiveBatchRowId] = useState<number | null>(null);
  const [commonCombinations, setCommonCombinations] = useState<any[]>([]);

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
      isManualDoctor: false,
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
        setIsManualDoctor(target.isManualDoctor || false);
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
            isManualDoctor,
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
        isManualDoctor: false,
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
      setIsManualDoctor(false);
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
        setIsManualDoctor(fallback.isManualDoctor || false);
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
    if (activeRowSearchIndex === null || rowSearchTerm.trim().length < 3) {
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
      
    // Fetch quick-add common combinations from inventory
    api.getInventory()
      .then(data => {
        if (Array.isArray(data)) {
          // Take top 12 active inventory items as quick adds
          const topItems = data.slice(0, 12).map(med => ({
            id: med.id,
            name: med.name,
            batch: med.batch_number || 'B-GEN',
            expiry: med.expiry_date || '12/28',
            mrp: med.mrp || 0,
            costPrice: med.purchase_price || ((med.mrp || 0) * 0.7),
            salts: med.hsn || 'Generic',
            packSize: parseInt(med.pack_size || '10', 10) || 10
          }));
          setCommonCombinations(topItems);
        }
      })
      .catch(err => console.error('Error fetching common combinations:', err));
  }, []);

  // Fetch customer suggestions for patient autocomplete
  useEffect(() => {
    if (patientName.trim().length < 2) {
      setPatientSuggestions([]);
      setShowPatientSuggestions(false);
      return;
    }
    api.getPatients()
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          const lower = patientName.toLowerCase();
          const filtered = data.filter(
            (c: any) =>
              (c.name || '').toLowerCase().includes(lower) ||
              (c.phone || '').includes(patientName)
          ).slice(0, 8);
          setPatientSuggestions(filtered);
          setShowPatientSuggestions(filtered.length > 0);
        }
      })
      .catch(() => {});
  }, [patientName]);

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
    if (searchTerm.trim().length < 3) {
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
  const [manualDiscount, setManualDiscount] = useState(0);
  const [manualPackSize, setManualPackSize] = useState(10);
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
        discount: 0,
        packSize: med.packSize || 10,
        mrp: med.mrp, 
        costPrice: med.costPrice || (med.mrp * 0.7),
        salts: med.salts || '' 
      }];
    });
  };

  const addManualItem = () => {
    if (!manualName.trim()) {
      // Focus input if empty
      const inputEl = document.querySelector('input[placeholder*="Add Next Medicine"]') as HTMLInputElement;
      if (inputEl) inputEl.focus();
      return;
    }
    
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
      discount: manualDiscount,
      packSize: manualPackSize,
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
    setManualDiscount(0);
    setManualPackSize(10);
    setManualMrp(0);
    setManualCostPrice(0);
    
    // Focus back on the manualName input for fast continuous entry
    setTimeout(() => {
      document.getElementById('manual-medicine-name-input')?.focus();
    }, 50);
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
    const itemTotalBeforeDiscount = (item.mrp * item.qty) + (unitRate * (item.looseQty || 0));
    return sum + itemTotalBeforeDiscount * (1 - (item.discount || 0) / 100);
  }, 0);
  
  const discountAmount = subtotal * (discount / 100);
  const grandTotal = Math.round(subtotal - discountAmount);

  const totalCost = cart.reduce((sum, item) => {
    const itemCost = item.costPrice != null ? item.costPrice : (item.mrp * 0.7);
    const unitCostRate = item.packSize > 0 ? itemCost / item.packSize : itemCost;
    return sum + (itemCost * item.qty) + (unitCostRate * (item.looseQty || 0));
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
        const itemDiscount = item.discount || item.discountPer || 0;
        return {
          inventory_id: typeof item.id === 'number' && item.id < 1000000 ? item.id : undefined,
          medicine_name: item.name,
          batch_no: item.batch,
          expiry_date: item.expiry,
          mrp: item.mrp,
          quantity: item.qty || 0,
          unit_price: item.unitPrice || item.mrp,
          loose_qty: item.looseQty || 0,
          discount_per: itemDiscount
        };
      });

      const payload = {
        items: salesItems,
        discount: discountAmount,
        patient_name: patientName || 'Walk-in Customer',
        patient_phone: patientPhone,
        doctor_name: doctor || undefined,
        sale_date: date,
        paymentMedium: paymentMedium,
        paymentStatus: paymentMedium === 'CREDIT' ? 'UNPAID' : 'PAID',
        sendWhatsApp: sendWhatsApp,
        refillEnabled: refillEnabled,
        refillDays: refillDays
      };

      const result = await api.createSale(payload);
      alert(`Sale completed! Invoice ${result.invoice_no || result.invoiceNo || 'SAVED'} logged. Grand Total: ₹${grandTotal}`);
      
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

  const handleRegisterDoctor = async () => {
    try {
      if (!newDoctorName) return;
      const docName = newDoctorSpecialty ? `Dr. ${newDoctorName} (${newDoctorSpecialty})` : `Dr. ${newDoctorName}`;
      await api.addDoctor({
        name: docName,
        specialization: newDoctorSpecialty || 'General',
        phone: newDoctorPhone,
        clinic_name: newDoctorClinic,
        reg_no: newDoctorRegNo
      });
      // Refresh doctors list
      const docs = await api.getDoctors();
      if (Array.isArray(docs)) setDoctorsList(docs);
      setDoctor(docName);
      setShowDoctorModal(false);
      setNewDoctorName('');
      setNewDoctorSpecialty('');
      setNewDoctorPhone('');
      setNewDoctorClinic('');
      setNewDoctorRegNo('');
    } catch (err) {
      console.error(err);
      alert('Failed to register doctor');
    }
  };

  const defaultDoctors = [
    { id: 901, name: 'Dr. Priya Mehta (Cardiologist)' },
    { id: 902, name: 'Dr. Raj Sharma (GP)' },
    { id: 903, name: 'Dr. Anita Patel (Pediatrician)' }
  ];

  const allDoctors = [
    ...defaultDoctors,
    ...doctorsList.filter(d => !defaultDoctors.some(dd => dd.name === d.name))
  ];

  const filteredDoctors = allDoctors.filter(doc => 
    doc.name.toLowerCase().includes(doctor.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col fade-in space-y-4 overflow-hidden pb-4">
      {/* Brand & System Status Banner */}
      <BrandBanner />

      {/* Patient & Transaction Bar (All in One Horizontal Line) */}
      <div className="glass-panel p-3.5 flex flex-wrap items-center gap-4 bg-white/5 border-glass-border text-xs w-full relative z-20">
        {/* Patient Name Group */}
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <span className="font-bold text-muted whitespace-nowrap">👤 Pt:</span>
          <div className="flex-1 flex gap-1 items-center w-full relative">
            <input 
              type="text" 
              className="premium-input text-xs py-1.5 px-2 flex-1 w-full" 
              placeholder="Walk-in Customer" 
              value={patientName}
              onChange={e => { updatePatientName(e.target.value); setPatientHighlightIndex(-1); }}
              onFocus={() => { if (patientSuggestions.length > 0) setShowPatientSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowPatientSuggestions(false), 180)}
              onKeyDown={e => {
                if (!showPatientSuggestions || patientSuggestions.length === 0) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setPatientHighlightIndex(i => Math.min(i + 1, patientSuggestions.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setPatientHighlightIndex(i => Math.max(i - 1, 0));
                } else if (e.key === 'Enter' && patientHighlightIndex >= 0) {
                  e.preventDefault();
                  const sel = patientSuggestions[patientHighlightIndex];
                  updatePatientName(sel.name);
                  setPatientPhone(sel.phone || '');
                  setShowPatientSuggestions(false);
                  setPatientHighlightIndex(-1);
                } else if (e.key === 'Escape') {
                  setShowPatientSuggestions(false);
                  setPatientHighlightIndex(-1);
                }
              }}
              aria-label="Patient Name"
            />
            {/* Patient suggestions dropdown */}
            {showPatientSuggestions && (
              <div className="absolute left-0 top-full z-[99999] mt-1 bg-[#18181b]/95 backdrop-blur border border-glass-border rounded-xl overflow-hidden w-full max-h-44 overflow-y-auto shadow-2xl">
                {patientSuggestions.map((c, idx) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => {
                      updatePatientName(c.name);
                      setPatientPhone(c.phone || '');
                      setShowPatientSuggestions(false);
                      setPatientHighlightIndex(-1);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs border-b border-glass-border/10 transition-all flex items-center justify-between gap-2 ${
                      idx === patientHighlightIndex
                        ? 'bg-primary/25 text-white'
                        : 'text-text hover:bg-primary/15'
                    }`}
                  >
                    <span className="font-semibold truncate">{c.name}</span>
                    {c.phone && <span className="text-muted font-mono text-[10px] shrink-0">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
            <button 
              onClick={() => setShowPatientModal(true)}
              className="h-8 w-8 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary transition-all flex items-center justify-center shrink-0"
              title="Manage Patient Profile & Refills"
            >
              <Plus size={13} className="stroke-[3]" />
            </button>
          </div>
        </div>

        {/* WhatsApp ON/OFF Switch */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            onClick={() => setSendWhatsApp(!sendWhatsApp)}
            className={`h-8 px-3 rounded-lg border text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-all select-none ${
              sendWhatsApp 
                ? 'bg-green/15 border-green/40 text-green hover:bg-green/25' 
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

        {/* Phone Number Group */}
        <div className="flex items-center gap-2 flex-1 min-w-[160px] max-w-[200px]">
          <span className="font-bold text-muted whitespace-nowrap">📞 No:</span>
          <input 
            type="text" 
            className="premium-input text-xs py-1.5 px-2 w-full font-mono text-text" 
            placeholder="9876543210"
            value={patientPhone}
            onChange={e => setPatientPhone(e.target.value)}
            aria-label="Phone Number"
          />
        </div>

        {/* Doctor Dropdown Group */}
        <div className="flex items-center gap-2 flex-1 min-w-[260px] relative">
          <span className="font-bold text-muted whitespace-nowrap">🥼 Dr:</span>
          <div className="relative flex-1 flex gap-1">
            <div className="relative flex-1">
              <input 
              type="text"
              className="premium-input text-xs py-1.5 pl-2 pr-7 bg-bg2 w-full text-text focus:border-sky"
              placeholder="Type or Select Doctor..."
              value={doctor}
              onChange={e => { setDoctor(e.target.value); setDoctorHighlightIndex(-1); }}
              onFocus={() => setIsDoctorDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsDoctorDropdownOpen(false), 200)}
              onKeyDown={e => {
                if (!isDoctorDropdownOpen || filteredDoctors.length === 0) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setDoctorHighlightIndex(i => Math.min(i + 1, filteredDoctors.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setDoctorHighlightIndex(i => Math.max(i - 1, 0));
                } else if (e.key === 'Enter' && doctorHighlightIndex >= 0) {
                  e.preventDefault();
                  setDoctor(filteredDoctors[doctorHighlightIndex].name);
                  setIsDoctorDropdownOpen(false);
                  setDoctorHighlightIndex(-1);
                } else if (e.key === 'Escape') {
                  setIsDoctorDropdownOpen(false);
                  setDoctorHighlightIndex(-1);
                }
              }}
              title="Select or Type Doctor Name"
            />
            {/* Custom chevron indicator */}
            <span className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-muted">
              <svg className="w-3 h-3 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
              </svg>
            </span>
            
            {/* Custom Dropdown List */}
            {isDoctorDropdownOpen && (
              <div className="absolute left-0 right-0 z-[99999] mt-1.5 bg-[#18181b]/95 backdrop-blur border border-glass-border rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-2xl">
                {filteredDoctors.length > 0 ? (
                  filteredDoctors.map((doc, idx) => (
                    <button
                      key={doc.id}
                      type="button"
                      onMouseDown={() => {
                        setDoctor(doc.name);
                        setIsDoctorDropdownOpen(false);
                        setDoctorHighlightIndex(-1);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs border-b border-glass-border/10 transition-all font-semibold ${
                        idx === doctorHighlightIndex
                          ? 'bg-sky/25 text-white'
                          : 'text-text hover:bg-sky/20 hover:text-white'
                      }`}
                    >
                      {doc.name}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-muted italic">
                    Press Enter to add custom: "{doctor}"
                  </div>
                )}
              </div>
            )}
          </div>
          <button 
            onClick={() => setShowDoctorModal(true)}
            className="h-8 w-8 rounded-lg bg-sky/10 hover:bg-sky/20 border border-sky/20 text-sky transition-all flex items-center justify-center shrink-0"
            title="Register New Doctor"
          >
            <Plus size={13} className="stroke-[3]" />
          </button>
        </div>
      </div>

        {/* Date Stamp Group */}
        <div className="flex items-center gap-2 flex-1 min-w-[140px] max-w-[180px]">
          <span className="font-bold text-muted whitespace-nowrap">📅:</span>
          <input 
            type="date" 
            className="premium-input text-xs py-1.5 px-2 text-text w-full" 
            value={date}
            onChange={e => setDate(e.target.value)}
            aria-label="Transaction Date"
          />
        </div>
      </div>

      {/* Search Medicine Section */}
      <div className="glass-panel p-4 flex flex-col gap-3.5 bg-white/5 border-glass-border relative z-10">
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
                <div className="absolute left-0 right-0 z-[99999] mt-1.5 bg-[#18181b]/95 backdrop-blur border border-glass-border rounded-xl overflow-hidden max-h-60 overflow-y-auto shadow-2xl">
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
                              <div className="font-mono text-sky font-bold">MRP: ₹{Math.round(med.mrp)}</div>
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
            {commonCombinations.map(med => (
              <button
                key={med.id}
                onClick={() => addToCart(med)}
                className="flex items-center gap-3 bg-white/5 border border-glass-border/50 hover:border-primary/40 hover:bg-primary/5 px-3 py-1.5 rounded-full transition-all group whitespace-nowrap"
              >
                <span className="text-xs font-bold text-text group-hover:text-primary transition-all">{med.name}</span>
                <span className="text-[10px] text-primary opacity-60 group-hover:opacity-100 font-bold">+</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart & Actions Grid (75% / 25% Split Column Layout) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-hidden">
        {/* LEFT: CART TABLE (75% / 3/4 Column Width) */}
        <div className="lg:col-span-3 glass-panel flex flex-col overflow-hidden bg-white/5 border-glass-border">
          <div className="p-2 border-b border-glass-border flex items-center justify-between gap-3 bg-black/10 flex-nowrap">
            <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0 scrollbar-thin py-0.5">
              {tabs.map((t) => {
                const isActive = t.id === activeTabId;
                const count = getTabItemsCount(t);
                const displayName = t.patientName.trim() ? `Pt: ${t.patientName}` : t.name;
                return (
                  <div
                    key={t.id}
                    onClick={() => switchTab(t.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-semibold text-xs transition-all select-none cursor-pointer flex-shrink-0 whitespace-nowrap ${
                      isActive 
                        ? 'bg-primary/20 border-primary text-primary font-bold' 
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
                className="flex items-center justify-center flex-shrink-0 p-1.5 rounded-lg border border-dashed border-glass-border text-muted hover:text-text hover:border-text transition-all bg-white/5 hover:bg-white/10 h-[30px] w-[30px]"
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

                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">Qty (Str)</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">Loose Qty</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">Disc %</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-right">MRP</th>
                  <th className="p-3 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border text-right">Total</th>
                  <th className="p-3 text-xs font-bold text-muted tracking-wider border-b border-glass-border"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map(item => {
                  const unitRate = item.packSize > 0 ? item.mrp / item.packSize : item.mrp;
                  const itemTotal = ((item.mrp * item.qty) + (unitRate * (item.looseQty || 0))) * (1 - (item.discount || 0) / 100);
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
                            <div className="absolute left-0 right-0 z-[99999] mt-1 bg-[#18181b]/98 backdrop-blur border border-glass-border rounded-xl overflow-hidden max-h-48 overflow-y-auto w-64 shadow-2xl">
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
                                    <span className="text-[9px] text-sky font-bold font-mono mt-0.5">MRP: ₹{Math.round(med.mrp)} | Stock: {med.quantity}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="text-[9px] text-muted ml-1.5 mt-0.5 truncate max-w-[160px]">{item.salts || 'Generic Salts'}</div>
                      </td>

                      {/* Batch */}
                      <td className="p-2 relative">
                        <div className="relative">
                          <input
                            type="text"
                            className="premium-input font-mono text-xs font-semibold py-1 px-1.5 w-24 text-center bg-white/5 border-glass-border/60 ml-1 cursor-pointer"
                            value={item.batch || ''}
                            placeholder="Batch"
                            onChange={e => updateCartItem(item.id, 'batch', e.target.value)}
                            onFocus={() => {
                              setActiveBatchRowId(item.id);
                              api.searchMedicine(item.name)
                                .then(data => {
                                  if (Array.isArray(data)) {
                                    // filter matching name exactly
                                    const matches = data.filter(med => med.medicine_name.toLowerCase().trim() === item.name.toLowerCase().trim());
                                    setRowBatchesList(matches.length > 0 ? matches : data);
                                  }
                                })
                                .catch(err => console.error('Error fetching batches:', err));
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                if (activeBatchRowId === item.id) {
                                  setActiveBatchRowId(null);
                                }
                              }, 250);
                            }}
                          />
                          
                          {activeBatchRowId === item.id && rowBatchesList.length > 1 && (
                            <div className="absolute left-1 z-[99999] mt-1 bg-[#18181b]/95 backdrop-blur border border-glass-border rounded-xl overflow-hidden max-h-36 overflow-y-auto w-52 text-left shadow-2xl">
                              <div className="p-1.5 border-b border-glass-border/30 bg-black/20 text-[9px] font-bold text-muted uppercase tracking-wider">
                                Switch Batch:
                              </div>
                              {rowBatchesList.map(b => (
                                <button
                                  key={b.inventory_id}
                                  type="button"
                                  onMouseDown={() => {
                                    updateCart(prev => prev.map(cItem => {
                                      if (cItem.id !== item.id) return cItem;
                                      return {
                                        ...cItem,
                                        id: b.inventory_id,
                                        batch: b.batch_no,
                                        expiry: b.expiry_date,
                                        mrp: b.mrp,
                                        costPrice: b.cost_price,
                                        packSize: b.pack_size || cItem.packSize
                                      };
                                    }));
                                    setActiveBatchRowId(null);
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 hover:bg-sky/20 hover:text-text border-b border-glass-border/10 text-[10px] font-mono transition-all block ${b.batch_no === item.batch ? 'bg-sky/10 text-sky' : 'text-text'}`}
                                >
                                  <span className="font-bold block">{b.batch_no}</span>
                                  <span className="text-muted block text-[8px]">Exp: {b.expiry_date} | Stock: {b.quantity} | MRP: ₹{b.mrp}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      
                      {/* Expiry */}
                      <td className="p-2 text-center select-none">
                        <div className="font-mono text-xs font-semibold text-text bg-white/5 px-2 py-1 rounded border border-glass-border/30 inline-block">{item.expiry}</div>
                      </td>



                      {/* Quantity (Str) */}
                      <td className="p-2 text-center">
                        <input 
                          type="number" 
                          className="premium-input text-xs py-1 px-1.5 w-10 text-center font-mono font-bold text-text bg-white/5 border-glass-border/60" 
                          value={item.qty}
                          onChange={e => updateCartItem(item.id, 'qty', Math.max(0, Number(e.target.value)))}
                          min="0"
                        />
                      </td>

                      {/* Loose Qty */}
                      <td className="p-2 text-center">
                        <input 
                          type="number" 
                          className="premium-input text-xs py-1 px-1.5 w-10 text-center font-mono font-bold border-amber-500/30 focus:border-amber-500 bg-amber-500/5 text-amber-200" 
                          value={item.looseQty || 0}
                          onChange={e => updateCartItem(item.id, 'looseQty', Math.max(0, Number(e.target.value)))}
                          min="0"
                        />
                      </td>

                      {/* Discount */}
                      <td className="p-2 text-center">
                        <input 
                          type="number" 
                          className="premium-input text-xs py-1 px-1.5 w-12 text-center font-mono font-bold text-sky bg-sky/5 border-sky/30 focus:border-sky" 
                          value={item.discount || 0}
                          onChange={e => updateCartItem(item.id, 'discount', Math.min(100, Math.max(0, Number(e.target.value))))}
                          min="0"
                          max="100"
                        />
                      </td>

                      {/* MRP */}
                      <td className="p-2 text-right">
                        <input 
                          type="number" 
                          className="premium-input text-xs font-mono py-1 px-1.5 w-16 text-right bg-white/5 border-glass-border/60" 
                          value={item.mrp || ''}
                          placeholder="0.00"
                          onChange={e => updateCartItem(item.id, 'mrp', Math.max(0, Number(e.target.value)))}
                        />
                      </td>

                      <td className="p-2 text-right text-xs font-mono font-bold text-primary">
                        <div className="font-mono text-sm text-green font-bold">
                          ₹{Math.round(itemTotal)}
                        </div>
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
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <Plus size={11} className="text-sky animate-pulse stroke-[3]" />
                      </span>
                      <input 
                        id="manual-medicine-name-input"
                        type="text" 
                        placeholder="Add Next Medicine / Custom Entry..." 
                        className="premium-input text-xs py-1 pl-7 pr-2 w-full border-sky/30 text-text bg-white/5 font-semibold placeholder:text-muted focus:border-sky" 
                        value={manualName}
                        onChange={e => setManualName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                      />
                    </div>
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

                  {/* Quantity */}
                  <td className="p-2 text-center">
                    <input 
                      type="number" 
                      className={`premium-input text-xs font-mono py-1 px-1.5 w-10 text-center font-bold bg-white/5 transition-all ${!manualName.trim() ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''}`}
                      value={manualQty}
                      onChange={e => setManualQty(Math.max(0, Number(e.target.value)))}
                      min="0"
                      disabled={!manualName.trim()}
                      title={!manualName.trim() ? 'Please enter medicine name first' : ''}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  {/* Loose Quantity */}
                  <td className="p-2 text-center">
                    <input 
                      type="number" 
                      className={`premium-input text-xs font-mono py-1 px-1.5 w-10 text-center font-bold bg-white/5 text-amber-200 border-amber-500/30 transition-all ${!manualName.trim() ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''}`}
                      value={manualLooseQty}
                      onChange={e => setManualLooseQty(Math.max(0, Number(e.target.value)))}
                      min="0"
                      disabled={!manualName.trim()}
                      title={!manualName.trim() ? 'Please enter medicine name first' : ''}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  {/* Discount */}
                  <td className="p-2 text-center">
                    <input 
                      type="number" 
                      placeholder="%"
                      className="premium-input text-xs font-mono py-1 px-1.5 w-12 text-center font-bold bg-sky/5 border-sky/30 focus:border-sky text-sky" 
                      value={manualDiscount || ''}
                      onChange={e => setManualDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                      min="0"
                      max="100"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  {/* MRP */}
                  <td className="p-2">
                    <input 
                      type="number" 
                      placeholder="MRP"
                      className="premium-input text-xs font-mono py-1 px-1.5 w-16 text-right bg-white/5" 
                      value={manualMrp || ''}
                      onChange={e => {
                        const val = Math.max(0, Number(e.target.value));
                        setManualMrp(val);
                        setManualCostPrice(prev => prev === 0 || prev === manualMrp * 0.7 ? val * 0.7 : prev);
                      }}
                      min="0"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualItem(); } }}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <div className="font-mono text-sm text-green font-bold bg-green/10 border border-green/20 rounded-md px-2 py-1 w-full text-right shadow-inner">
                      ₹{Math.round(((manualMrp * manualQty) + ((manualPackSize > 0 ? manualMrp / manualPackSize : manualMrp) * (manualLooseQty || 0))) * (1 - (manualDiscount || 0) / 100))}
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <button 
                      onClick={addManualItem}
                      className="p-1.5 rounded-lg border flex items-center justify-center transition-all bg-sky/20 border-sky text-sky hover:bg-sky/35 active:scale-95 cursor-pointer"
                      title="Add Next Medicine to Cart"
                      onKeyDown={e => {
                        if (e.key === 'Tab' && !e.shiftKey) {
                          e.preventDefault();
                          document.getElementById('manual-medicine-name-input')?.focus();
                        }
                      }}
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
                  Subtotal: <span className="font-mono text-sm text-text ml-1">₹{Math.round(subtotal)}</span>
                </div>
                
                {discountAmount > 0 && (
                  <div className="text-amber-500 font-mono text-sm font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Saved: -₹{Math.round(discountAmount)}
                  </div>
                )}
                
                <div className="flex items-center gap-1.5">
                  <span>Disc %:</span>
                  <input 
                    type="number" 
                    className="premium-input text-xs py-0.5 px-1.5 w-12 text-right font-mono" 
                    value={discount}
                    onChange={e => setDiscount(Number(e.target.value))}
                    min="0"
                    max="100"
                  />
                </div>
                
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

             </div>

             {/* Action trigger button */}
             <button 
               onClick={handleCompleteSale}
               disabled={cart.length === 0}
               className={`premium-btn text-white py-2 px-6 text-sm flex items-center gap-2 font-bold uppercase tracking-wider rounded-xl transition-all ${
                 cart.length === 0 
                   ? 'bg-white/5 border border-glass-border text-muted cursor-not-allowed' 
                   : 'bg-green hover:bg-emerald-600'
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
                  {commonCombinations.slice(0, 2).map((med, idx) => (
                    <button 
                      key={`dr-sugg-${idx}`}
                      onClick={() => addToCart(med)}
                      className="w-full flex items-center justify-between p-2 rounded-lg bg-white/5 border border-glass-border/40 hover:border-primary/40 hover:bg-primary/5 text-left text-xs transition-all"
                    >
                      <div>
                        <span className="font-semibold block text-text">{med.name}</span>
                        <span className="text-[9px] text-muted">Co-prescribed ({Math.floor(Math.random() * 20 + 75)}% match)</span>
                      </div>
                      <span className="text-[10px] text-primary font-bold">+ Add</span>
                    </button>
                  ))}
                  {commonCombinations.length === 0 && (
                    <span className="text-xs text-muted text-center italic block">No suggestions available</span>
                  )}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999] p-4 animate-fade-in">
          <div className="glass-panel max-w-md w-full p-6 space-y-5 border-glass-border bg-[#18181b]/95 rounded-2xl relative">
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
                onClick={async () => {
                  if (patientName.trim()) {
                    try {
                      await api.addPatient({ name: patientName.trim(), phone: patientPhone.trim() });
                    } catch (e) {
                      // Patient may already exist, ignore duplicate errors
                    }
                  }
                  setShowPatientModal(false);
                }}
                className="premium-btn bg-primary text-text hover:bg-teal-500 py-2 px-5 text-xs font-bold uppercase tracking-wider"
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doctor Registration Modal */}
      {showDoctorModal && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-sm fade-in">
          <div className="bg-bg border border-glass-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-glass-border bg-white/5 flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-sky">
                <Plus size={18} />
                Register New Doctor
              </h3>
              <button onClick={() => setShowDoctorModal(false)} className="text-muted hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Doctor Name *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-semibold">Dr.</span>
                  <input
                    type="text"
                    className="premium-input w-full pl-9"
                    placeholder="John Doe"
                    value={newDoctorName}
                    onChange={(e) => setNewDoctorName(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Specialization</label>
                <input
                  type="text"
                  className="premium-input w-full"
                  placeholder="e.g. Cardiologist"
                  value={newDoctorSpecialty}
                  onChange={(e) => setNewDoctorSpecialty(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Phone</label>
                <input
                  type="text"
                  className="premium-input w-full"
                  placeholder="Contact Number"
                  value={newDoctorPhone}
                  onChange={(e) => setNewDoctorPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Clinic Name</label>
                <input
                  type="text"
                  className="premium-input w-full"
                  placeholder="Clinic / Hospital Name"
                  value={newDoctorClinic}
                  onChange={(e) => setNewDoctorClinic(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Registration No.</label>
                <input
                  type="text"
                  className="premium-input w-full"
                  placeholder="e.g. MMC-12345"
                  value={newDoctorRegNo}
                  onChange={(e) => setNewDoctorRegNo(e.target.value)}
                />
              </div>
            </div>
            
            <div className="px-5 py-4 border-t border-glass-border bg-black/20 flex justify-end gap-3">
              <button 
                onClick={() => setShowDoctorModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-muted hover:text-white hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleRegisterDoctor}
                disabled={!newDoctorName}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-sky text-white hover:bg-sky/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_15px_rgba(14,165,233,0.3)]"
              >
                <CheckCircle size={16} /> Save Doctor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
