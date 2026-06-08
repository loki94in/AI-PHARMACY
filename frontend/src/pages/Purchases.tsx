// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, Edit, Camera } from 'lucide-react';
import { api, apiClient } from '../services/api';
import AICamera from '../components/AICamera';

interface Medicine {
  id: number;
  name: string;
  generic_name: string;
  manufacturer: string;
  pack_unit: string;
  strength: string;
  mrp: number;
  rate: number;
  scheme_paid: number;
  scheme_free: number;
  cgst_per: number;
  sgst_per: number;
  hsn_code: string;
}

interface BillItem {
  id: string;
  medicine_id: number | null;
  medicine_name: string;
  original_name?: string;
  batch_no: string;
  expiry_date: string;
  qty: number;
  free_qty: number;
  rate: number;
  mrp: number;
  cgst_per: number;
  sgst_per: number;
  cd_rs: number;
  cd_per: number;
  amount: number;
  scheme_paid: number;
  scheme_free: number;
}

interface Distributor {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  state_code: string;
}

interface PurchaseHistory {
  id: number;
  invoice_no: string;
  date: string;
  distributor_name: string;
  total_amount: number;
}

const Purchases: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [selectedDistributor, setSelectedDistributor] = useState<number | null>(null);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [showDistributorDropdown, setShowDistributorDropdown] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [grnNo, setGrnNo] = useState(`GRN-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(Math.random()*1000).toString().padStart(3, '0')}`);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [globalCdPer, setGlobalCdPer] = useState(0);
  const [extraCredit, setExtraCredit] = useState(0);
  const [items, setItems] = useState<BillItem[]>([createEmptyItem()]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistory[]>([]);
  
  // Helper to get date N days ago in YYYY-MM-DD format
  const getNDaysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  };

  // History list filter states
  const [filterDistributor, setFilterDistributor] = useState('');
  const [filterInvoice, setFilterInvoice] = useState('');
  const [filterStartDate, setFilterStartDate] = useState(getNDaysAgo(13));
  const [filterEndDate, setFilterEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');

  const [saving, setSaving] = useState(false);
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [schemeMatchStatus, setSchemeMatchStatus] = useState<{ [key: string]: string }>({});
  const [showDistributorModal, setShowDistributorModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [newDistributor, setNewDistributor] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    state_code: '',
  });
  const [savingDistributor, setSavingDistributor] = useState(false);
  const [showPriceHistoryModal, setShowPriceHistoryModal] = useState(false);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [priceHistoryMedicine, setPriceHistoryMedicine] = useState('');
  const [showMedicineModal, setShowMedicineModal] = useState(false);
  const [newMedicine, setNewMedicine] = useState({
    name: '',
    generic_name: '',
    manufacturer: '',
    marketed_by: '',
    pack_unit: 'Tablet',
    strength: '',
    pack_size: '',
    cgst_per: 5,
    sgst_per: 5,
    hsn_code: '',
  });
  const [savingMedicine, setSavingMedicine] = useState(false);
  const [activeMedicineIndex, setActiveMedicineIndex] = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraTargetIndex, setCameraTargetIndex] = useState<number | null>(null);

  const handleCameraScanResult = (result: any) => {
    if (cameraTargetIndex === null) return;
    const info = result.medicineInfo || {};
    const newItems = [...items];
    const item = newItems[cameraTargetIndex];

    if (info.potentialName) {
      item.medicine_name = info.potentialName;
    }
    if (info.batchNumber) {
      item.batch_no = info.batchNumber;
    }
    if (info.expiryDate) {
      // Map formatting from DD/MM/YYYY or similar if needed, default copy
      item.expiry_date = info.expiryDate;
    }
    if (info.mrp) {
      item.mrp = info.mrp;
    }
    
    // Check if there is a matching medicine in catalog to load rate/gst defaults
    const resolveScannedDetails = async () => {
      try {
        const res = await api.catalogSearch(item.medicine_name);
        const list = res || [];
        const match = list.find((m: any) => m.name.toLowerCase() === item.medicine_name.toLowerCase());
        if (match) {
          item.medicine_id = match.id;
          item.mrp = match.mrp || item.mrp || 0;
          item.rate = match.rate || item.rate || 0;
          item.cgst_per = match.cgst_per || 0;
          item.sgst_per = match.sgst_per || 0;
        }
        item.amount = calculateItemAmount(item);
        setItems(newItems);
      } catch (err) {
        console.error('Failed to match scanned medicine to database:', err);
      }
    };
    
    resolveScannedDetails();
    setShowCamera(false);
    setCameraTargetIndex(null);
  };

  function createEmptyItem(): BillItem {
    return {
      id: crypto.randomUUID(),
      medicine_id: null,
      medicine_name: '',
      batch_no: '',
      expiry_date: '01/12',
      qty: 0,
      free_qty: 0,
      rate: 0,
      mrp: 0,
      cgst_per: 0,
      sgst_per: 0,
      cd_rs: 0,
      cd_per: 0,
      amount: 0,
      scheme_paid: 0,
      scheme_free: 0,
    };
  }

  useEffect(() => {
    fetchDistributors();
    fetchPurchaseHistory();
  }, []);

  const fetchDistributors = async () => {
    try {
      const response = await api.getDistributors();
      const list = Array.isArray(response) ? response : (response.data || []);
      setDistributors(list);
    } catch (error) {
      console.error('Error fetching distributors:', error);
    }
  };

  const fetchPurchaseHistory = async () => {
    try {
      const list = await api.getPurchases();
      // STRICT RULE: Only show last 100
      setPurchaseHistory(Array.isArray(list) ? list.slice(0, 100) : []);
    } catch (err) {
      console.error('Error fetching purchase history:', error);
    }
  };

  const saveDistributor = async () => {
    if (!newDistributor.name) {
      alert('Distributor name is required');
      return;
    }

    setSavingDistributor(true);
    try {
      const response = await apiClient.post('/settings/distributors', newDistributor);
      const saved = response.data.data;
      
      setDistributors([...distributors, saved]);
      setSelectedDistributor(saved.id);
      setDistributorSearch(saved.name);
      
      setNewDistributor({ name: '', phone: '', email: '', address: '', state_code: '' });
      setShowDistributorModal(false);
    } catch (error) {
      console.error('Error saving distributor:', error);
      alert('Failed to save distributor');
    } finally {
      setSavingDistributor(false);
    }
  };

  const saveMedicine = async () => {
    if (!newMedicine.name) {
      alert('Medicine name is required');
      return;
    }

    setSavingMedicine(true);
    try {
      const response = await apiClient.post('/medicines', newMedicine);
      const saved = response.data.data;
      
      // Auto-select in the current row
      if (activeMedicineIndex !== null) {
        const newItems = [...items];
        const item = newItems[activeMedicineIndex];
        item.medicine_id = saved.id;
        item.medicine_name = saved.name;
        item.mrp = saved.mrp;
        item.rate = saved.rate;
        item.cgst_per = saved.cgst_per;
        item.sgst_per = saved.sgst_per;
        item.scheme_paid = saved.scheme_paid;
        item.scheme_free = saved.scheme_free;
        item.amount = calculateItemAmount(item);
        setItems(newItems);
      }
      
      setNewMedicine({
        name: '', generic_name: '', manufacturer: '', marketed_by: '',
        pack_unit: 'Tablet', strength: '', pack_size: '',
        cgst_per: 5, sgst_per: 5, hsn_code: '',
      });
      setShowMedicineModal(false);
      setActiveMedicineIndex(null);
    } catch (error) {
      console.error('Error saving medicine:', error);
      alert('Failed to save medicine');
    } finally {
      setSavingMedicine(false);
    }
  };

  const searchMedicines = useCallback(async (term: string, index: number) => {
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await api.catalogSearch(term);
      setSearchResults(response.data || []);
      setActiveSearchIndex(index);
      setActiveMedicineIndex(index);
    } catch (error) {
      console.error('Error searching medicines:', error);
    }
  }, []);

  const fetchPriceHistory = async (medicineName: string) => {
    try {
      const response = await apiClient.get(`/purchases/price-history?name=${encodeURIComponent(medicineName)}`);
      setPriceHistory(response.data.data || []);
      setPriceHistoryMedicine(medicineName);
      setShowPriceHistoryModal(true);
    } catch (error) {
      console.error('Error fetching price history:', error);
    }
  };

  const selectMedicine = async (medicine: Medicine, index: number) => {
    const newItems = [...items];
    const item = newItems[index];

    item.medicine_id = medicine.id;
    item.medicine_name = medicine.name;
    item.mrp = medicine.mrp;
    item.rate = medicine.rate;
    item.cgst_per = medicine.cgst_per;
    item.sgst_per = medicine.sgst_per;
    item.scheme_paid = medicine.scheme_paid;
    item.scheme_free = medicine.scheme_free;

    try {
      const response = await api.getLastPurchase(medicine.name, selectedDistributor || undefined);
      if (response.data) {
        const lastPurchase = response.data;
        item.batch_no = lastPurchase.batch_no || '';
        item.expiry_date = lastPurchase.expiry_date || '';
        item.rate = lastPurchase.rate || medicine.rate;
        item.mrp = lastPurchase.mrp || medicine.mrp;
        item.cgst_per = lastPurchase.cgst_per || medicine.cgst_per;
        item.sgst_per = lastPurchase.sgst_per || medicine.sgst_per;
      }
    } catch (error) {
      console.log('No last purchase found for this medicine');
    }

    item.amount = calculateItemAmount(item);

    setItems(newItems);
    setSearchResults([]);
    setActiveSearchIndex(null);
  };

  const calculateItemAmount = (item: BillItem): number => {
    const baseAmount = item.qty * item.rate;
    const discountAmount = item.cd_rs + (baseAmount * item.cd_per / 100);
    const taxableAmount = baseAmount - discountAmount;
    const cgstAmount = taxableAmount * item.cgst_per / 100;
    const sgstAmount = taxableAmount * item.sgst_per / 100;
    return taxableAmount + cgstAmount + sgstAmount;
  };

  // Handle prefilled purchase data from navigation state (e.g. from Mail page)
  useEffect(() => {
    if (location.state?.prefilledPurchase) {
      const { distributorName, invoiceNo: prefInvoiceNo, date: prefDate, items: prefilledItems } = location.state.prefilledPurchase;
      
      if (prefInvoiceNo) setInvoiceNo(prefInvoiceNo);
      if (prefDate) setInvoiceDate(prefDate);
      
      // Try to find matching distributor in distributors list
      if (distributorName) {
        setDistributorSearch(distributorName);
        if (distributors.length > 0) {
          const matched = distributors.find(
            (d) => d.name.toLowerCase().includes(distributorName.toLowerCase()) || 
                   distributorName.toLowerCase().includes(d.name.toLowerCase())
          );
          if (matched) {
            setSelectedDistributor(matched.id);
            setDistributorSearch(matched.name);
          }
        }
      }

      if (Array.isArray(prefilledItems) && prefilledItems.length > 0) {
        const loadedItems = prefilledItems.map((item) => ({
          id: crypto.randomUUID(),
          medicine_id: null,
          medicine_name: item.medicine_name || '',
          original_name: item.medicine_name || '',
          batch_no: item.batch_no || '',
          expiry_date: item.expiry_date || '',
          qty: item.qty || 0,
          free_qty: item.free_qty || 0,
          rate: item.rate || 0,
          mrp: item.mrp || 0,
          cgst_per: 0,
          sgst_per: 0,
          cd_rs: 0,
          cd_per: 0,
          amount: (item.qty || 0) * (item.rate || 0),
          scheme_paid: 0,
          scheme_free: 0,
        }));
        
        setItems(loadedItems);
        
        // Auto-resolve medicine IDs for the loaded items
        const resolveMedicines = async () => {
          const updatedItems = loadedItems.map(item => ({ ...item, original_name: item.medicine_name }));
          let hasChanges = false;
          
          for (let i = 0; i < updatedItems.length; i++) {
            const mName = updatedItems[i].original_name;
            if (!mName) continue;
            try {
              // 1. Check for learned mapping first
              const learned = await api.getLearnedMapping(mName);
              if (learned && learned.success && learned.mapped && learned.medicine) {
                const match = learned.medicine;
                updatedItems[i].medicine_id = match.id;
                updatedItems[i].medicine_name = match.name;
                updatedItems[i].mrp = match.mrp || 0;
                updatedItems[i].rate = match.rate || updatedItems[i].rate;
                updatedItems[i].cgst_per = match.cgst_per || 0;
                updatedItems[i].sgst_per = match.sgst_per || 0;
                updatedItems[i].amount = calculateItemAmount(updatedItems[i]);
                hasChanges = true;
                continue;
              }

              // 2. Fallback to catalog search for EXACT matches
              const res = await api.catalogSearch(mName);
              const matchedList = res || [];
              if (matchedList.length > 0) {
                const match = matchedList.find((m: any) => m.name.toLowerCase() === mName.toLowerCase());
                if (match) {
                  updatedItems[i].medicine_id = match.id;
                  updatedItems[i].medicine_name = match.name;
                  updatedItems[i].mrp = match.mrp || 0;
                  updatedItems[i].rate = match.rate || updatedItems[i].rate;
                  updatedItems[i].cgst_per = match.cgst_per || 0;
                  updatedItems[i].sgst_per = match.sgst_per || 0;
                  updatedItems[i].amount = calculateItemAmount(updatedItems[i]);
                  hasChanges = true;
                } else {
                  // If not an exact match, make it empty so the user can fill the space
                  updatedItems[i].medicine_id = null;
                  updatedItems[i].medicine_name = '';
                  updatedItems[i].amount = 0;
                  hasChanges = true;
                }
              } else {
                // No match, empty name
                updatedItems[i].medicine_id = null;
                updatedItems[i].medicine_name = '';
                updatedItems[i].amount = 0;
                hasChanges = true;
              }
            } catch (err) {
              console.error('Error auto-resolving medicine:', mName, err);
            }
          }
          if (hasChanges) {
            setItems(updatedItems);
          }
        };
        
        resolveMedicines();
      }
      
      // Clean up the location state so it doesn't populate again on component updates/re-renders
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, distributors, navigate, location.pathname]);

  const updateItem = (index: number, field: keyof BillItem, value: any) => {
    const newItems = [...items];
    const item = newItems[index];

    if (field === 'qty' || field === 'free_qty' || field === 'rate' || field === 'mrp' || 
        field === 'cgst_per' || field === 'sgst_per' || field === 'cd_rs' || field === 'cd_per') {
      const parsedVal = parseFloat(value);
      (item as any)[field] = isNaN(parsedVal) ? 0 : parsedVal;
      
      // Auto match SGST and CGST
      if (field === 'sgst_per') {
        item.cgst_per = item.sgst_per;
      } else if (field === 'cgst_per') {
        item.sgst_per = item.cgst_per;
      }
    } else {
      (item as any)[field] = value;
    }

    if (field === 'qty' && item.scheme_paid > 0) {
      const expectedFree = Math.floor(item.qty / item.scheme_paid) * item.scheme_free;
      if (item.free_qty > expectedFree) {
        setSchemeMatchStatus(prev => ({
          ...prev,
          [item.id]: `Free qty reduced to ${expectedFree} (scheme: ${item.scheme_paid}+${item.scheme_free})`
        }));
        item.free_qty = expectedFree;
      } else {
        setSchemeMatchStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[item.id];
          return newStatus;
        });
      }
    }

    item.amount = calculateItemAmount(item);
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const addNewItem = () => {
    setItems([...items, createEmptyItem()]);
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalCd = 0;

    items.forEach(item => {
      const baseAmount = item.qty * item.rate;
      const discountAmount = item.cd_rs + (baseAmount * item.cd_per / 100);
      const taxableAmount = baseAmount - discountAmount;
      const cgstAmount = taxableAmount * item.cgst_per / 100;
      const sgstAmount = taxableAmount * item.sgst_per / 100;

      subtotal += taxableAmount;
      totalCgst += cgstAmount;
      totalSgst += sgstAmount;
      totalCd += discountAmount;
    });

    const globalDiscount = subtotal * globalCdPer / 100;
    const grandTotal = subtotal + totalCgst + totalSgst - globalDiscount - extraCredit;

    return {
      subtotal,
      totalCgst,
      totalSgst,
      totalCd,
      globalDiscount,
      grandTotal,
    };
  };

  const savePurchase = async () => {
    if (!selectedDistributor || !invoiceNo) {
      alert('Please fill in distributor and invoice number');
      return;
    }

    const validItems = items.filter(item => item.medicine_id && item.qty > 0);
    if (validItems.length === 0) {
      alert('Please add at least one medicine with quantity');
      return;
    }

    setSaving(true);
    try {
      await api.createManualPurchase({
        distributor_id: selectedDistributor,
        invoice_no: invoiceNo,
        date: invoiceDate,
        cd_per: globalCdPer,
        extra_credit: extraCredit,
        items: validItems.map(item => ({
          medicine_id: item.medicine_id,
          medicine: item.medicine_name,
          original_name: item.original_name,
          batch_no: item.batch_no,
          expiry_date: item.expiry_date,
          qty: item.qty,
          free_qty: item.free_qty,
          rate: item.rate,
          mrp: item.mrp,
          cgst_per: item.cgst_per,
          sgst_per: item.sgst_per,
          cd_rs: item.cd_rs,
          cd_per: item.cd_per,
        })),
      });

      alert('Purchase saved successfully!');
      
      setItems([createEmptyItem()]);
      setSelectedDistributor(null);
      setDistributorSearch('');
      setInvoiceNo('');
      setGlobalCdPer(0);
      setExtraCredit(0);
      fetchPurchaseHistory();
    } catch (error) {
      console.error('Error saving purchase:', error);
      alert('Failed to save purchase');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadedFile) return;

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const response = await apiClient.post('/purchases/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const parsedItems = response.data.data;
      const newItems = parsedItems.map((item: any) => ({
        ...createEmptyItem(),
        medicine_name: item.name,
        qty: item.qty || item.quantity || 0,
        free_qty: item.free_qty || 0,
        rate: item.price || item.rate || 0,
        batch_no: item.batch_no || '',
        expiry_date: item.expiry_date || '01/12',
        mrp: item.mrp || 0,
        cgst_per: item.cgst_per || 0,
        sgst_per: item.sgst_per || 0,
        hsn_code: item.hsn_code || '',
        cd_per: item.cd_per || 0,
        cd_rs: item.cd_rs || 0,
      }));

      setItems(newItems);

      if (response.data.invoice_no) {
        setInvoiceNo(response.data.invoice_no);
      } else {
        const fileDigits = uploadedFile.name.replace(/\.[^/.]+$/, "").match(/\d+/);
        if (fileDigits) {
          setInvoiceNo(fileDigits[0]);
        }
      }

      if (response.data.invoice_date) {
        setInvoiceDate(response.data.invoice_date);
      }

      if (response.data.global_cd_per !== undefined) {
        setGlobalCdPer(response.data.global_cd_per);
      }

      if (response.data.distributor_name) {
        setDistributorSearch(response.data.distributor_name);
        const match = distributors.find((d: any) => d.name.toLowerCase() === response.data.distributor_name.toLowerCase());
        if (match) {
          setSelectedDistributor(match.id);
        } else {
          setSelectedDistributor(null);
        }
      }

      if (response.data.total_amount !== undefined && response.data.total_amount > 0) {
        // Calculate dynamic grand total to adjust extraCredit to match bill total exactly
        let subtotal = 0;
        let totalCgst = 0;
        let totalSgst = 0;
        newItems.forEach((item: any) => {
          const baseAmount = item.qty * item.rate;
          const discountAmount = item.cd_rs + (baseAmount * item.cd_per / 100);
          const taxableAmount = baseAmount - discountAmount;
          const cgstAmount = taxableAmount * item.cgst_per / 100;
          const sgstAmount = taxableAmount * item.sgst_per / 100;

          subtotal += taxableAmount;
          totalCgst += cgstAmount;
          totalSgst += sgstAmount;
        });

        const globalCdPerVal = response.data.global_cd_per || 0;
        const globalDiscount = subtotal * globalCdPerVal / 100;
        const calculatedGrandTotal = subtotal + totalCgst + totalSgst - globalDiscount;
        const diff = calculatedGrandTotal - response.data.total_amount;
        setExtraCredit(parseFloat(diff.toFixed(2)));
      } else {
        setExtraCredit(0);
      }

      setShowUploadModal(false);
      setUploadedFile(null);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to parse invoice file');
    }
  };

  const filteredHistory = purchaseHistory.filter(purchase => {
    const matchesDistributor = !filterDistributor.trim() || 
      (purchase.distributor_name && purchase.distributor_name.toLowerCase().includes(filterDistributor.toLowerCase()));
      
    const matchesInvoice = !filterInvoice.trim() || 
      (purchase.invoice_no && purchase.invoice_no.toLowerCase().includes(filterInvoice.toLowerCase()));
      
    const matchesDateRange = (() => {
      if (!purchase.date) return false;
      const pDate = purchase.date.substring(0, 10);
      const start = filterStartDate || '0000-00-00';
      const end = filterEndDate || '9999-99-99';
      return pDate >= start && pDate <= end;
    })();
      
    const matchesMinAmount = !filterMinAmount || 
      purchase.total_amount >= Number(filterMinAmount);
      
    const matchesMaxAmount = !filterMaxAmount || 
      purchase.total_amount <= Number(filterMaxAmount);
      
    return !!(matchesDistributor && matchesInvoice && matchesDateRange && matchesMinAmount && matchesMaxAmount);
  });

  const captureScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve(null);
        };
      });

      // Give a tiny delay to ensure frame is painted
      await new Promise(r => setTimeout(r, 300));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "screenshot.png", { type: "image/png" });
            setUploadedFile(file);
          }
          stream.getTracks().forEach(track => track.stop());
        }, 'image/png');
      } else {
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err) {
      console.error("Failed to capture screen:", err);
      alert("Screen capture was canceled or failed.");
    }
  };

  const totals = calculateTotals();

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Record Supplier Purchases</h1>
          <p className="text-gray-400">Manage invoices, GRN creation, and inventory incoming</p>
        </div>
        <div className="flex gap-2 text-xs flex-wrap max-w-lg">
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Purchase entry</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ GRN creation</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Batch management</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Expiry capture</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Cost tracking</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ GST input tracking</span>
        </div>
      </div>

      {/* Header Section */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 border border-white/20">
        <div className="flex items-center gap-3">
          {/* Distributor */}
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-gray-300 mb-1">Distributor *</label>
            <div className="flex gap-1">
              <div className="flex-1 min-w-0 relative">
                <input
                  type="text"
                  value={distributorSearch}
                  onChange={(e) => {
                    setDistributorSearch(e.target.value);
                    setShowDistributorDropdown(true);
                    if (e.target.value === '') {
                      setSelectedDistributor(null);
                    }
                  }}
                  onFocus={() => setShowDistributorDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDistributorDropdown(false), 200)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Type to search distributor..."
                />
                {showDistributorDropdown && distributorSearch && (
                  <div className="absolute z-[99999] w-full mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {distributors
                      .filter((d) => d.name.toLowerCase().includes(distributorSearch.toLowerCase()))
                      .map((dist) => (
                        <button
                          key={dist.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSelectedDistributor(dist.id);
                            setDistributorSearch(dist.name);
                            setShowDistributorDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-white/10 text-white text-sm"
                        >
                          {dist.name}
                          {dist.phone && <span className="text-gray-400 ml-2">({dist.phone})</span>}
                        </button>
                      ))}
                    {distributors.filter((d) => d.name.toLowerCase().includes(distributorSearch.toLowerCase())).length === 0 && (
                      <div className="px-4 py-2 text-gray-400 text-sm">No match found. Click + to add.</div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowDistributorModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white w-9 h-9 rounded-lg font-bold flex-shrink-0"
                title="Add new distributor"
              >
                +
              </button>
            </div>
          </div>

          {/* Invoice No */}
          <div className="w-36">
            <label className="block text-sm font-medium text-gray-300 mb-1">Invoice No *</label>
            <input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="INV-001"
            />
          </div>

          {/* GRN No */}
          <div className="w-40">
            <label className="block text-sm font-medium text-gray-300 mb-1">GRN No</label>
            <input
              type="text"
              value={grnNo}
              onChange={(e) => setGrnNo(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
              title="Goods Receipt Note"
            />
          </div>

          {/* Date */}
          <div className="w-36">
            <label className="block text-sm font-medium text-gray-300 mb-1">Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Global CD % */}
          <div className="w-24">
            <label className="block text-sm font-medium text-gray-300 mb-1">CD %</label>
            <input
              type="number"
              value={globalCdPer}
              onChange={(e) => setGlobalCdPer(parseFloat(e.target.value) || 0)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              max="100"
            />
          </div>

          {/* Extra Credit */}
          <div className="w-28">
            <label className="block text-sm font-medium text-gray-300 mb-1">Extra Credit</label>
            <input
              type="number"
              value={extraCredit}
              onChange={(e) => setExtraCredit(parseFloat(e.target.value) || 0)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
            />
          </div>

          {/* Upload Button */}
          <div className="flex-shrink-0 pt-5">
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm"
            >
              📎 Upload
            </button>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 border border-white/20">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">Line Items</h2>
          <button
            onClick={addNewItem}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
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
                <th className="pb-3">Exp</th>
                <th className="pb-3">Rate</th>
                <th className="pb-3">MRP</th>
                <th className="pb-3">Qty</th>
                <th className="pb-3">Free</th>
                <th className="pb-3" title="Input CGST">CGST%</th>
                <th className="pb-3" title="Input SGST">SGST%</th>
                <th className="pb-3">CD ₹</th>
                <th className="pb-3">CD %</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id} className="border-b border-white/10">
                  <td className="py-3 text-gray-300">{index + 1}</td>
                  <td className="py-3">
                    <div className="relative">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={item.medicine_name}
                          onChange={(e) => {
                            updateItem(index, 'medicine_name', e.target.value);
                            searchMedicines(e.target.value, index);
                          }}
                          className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                          placeholder="Search medicine..."
                        />
                        {item.medicine_name && (
                          <button
                            onClick={() => fetchPriceHistory(item.medicine_name)}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white w-7 h-7 rounded text-sm flex-shrink-0"
                            title="View price history from all distributors"
                          >
                            📊
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setCameraTargetIndex(index);
                            setShowCamera(true);
                          }}
                          className="bg-sky/20 hover:bg-sky/40 border border-sky/30 text-sky w-7 h-7 rounded text-sm flex-shrink-0 flex items-center justify-center"
                          title="Scan drug package using AI Camera"
                        >
                          <Camera size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setActiveMedicineIndex(index);
                            setShowMedicineModal(true);
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white w-7 h-7 rounded text-sm font-bold flex-shrink-0"
                          title="Add new medicine"
                        >
                          +
                        </button>
                      </div>
                      {activeSearchIndex === index && searchResults.length > 0 && (
                        <div className="absolute z-[99999] w-full mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {searchResults.map((medicine) => (
                            <button
                              key={medicine.id}
                              onClick={() => selectMedicine(medicine, index)}
                              className="w-full text-left px-4 py-2 hover:bg-white/10 text-white"
                            >
                              {medicine.name} - ₹{medicine.mrp}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {item.original_name && (
                      <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 select-none">
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20">Parsed Name:</span>
                        <span className="font-mono truncate max-w-[200px]" title={item.original_name}>{item.original_name}</span>
                      </div>
                    )}
                    {schemeMatchStatus[item.id] && (
                      <p className="text-yellow-400 text-xs mt-1">{schemeMatchStatus[item.id]}</p>
                    )}
                  </td>
                  <td className="py-3">
                    <input
                      type="text"
                      value={item.batch_no}
                      onChange={(e) => updateItem(index, 'batch_no', e.target.value)}
                      className="w-20 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={item.expiry_date}
                      onChange={(e) => updateItem(index, 'expiry_date', e.target.value)}
                      className="w-20 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-3 relative group/btn">
                    <input
                      type="number"
                      value={item.rate === 0 ? '' : item.rate}
                      onChange={(e) => updateItem(index, 'rate', e.target.value)}
                      className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                    {item.medicine_name && item.rate > 0 && (
                      <div className="absolute z-[99999] bottom-full left-0 mb-2 hidden group-hover/btn:block w-56">
                        <div className="bg-gray-900 border border-blue-500 rounded-lg p-3 shadow-xl">
                          <p className="text-white font-semibold text-sm mb-2">{item.medicine_name}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-400">MRP:</span>
                              <span className="text-white">₹{item.mrp.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Rate:</span>
                              <span className="text-green-400">₹{item.rate.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Margin:</span>
                              <span className="text-yellow-400">₹{(item.mrp - item.rate).toFixed(2)} ({item.mrp > 0 ? (((item.mrp - item.rate) / item.mrp) * 100).toFixed(1) : 0}%)</span>
                            </div>
                            <div className="border-t border-gray-700 my-1"></div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Taxable:</span>
                              <span className="text-white">₹{(item.qty * item.rate - item.cd_rs - (item.qty * item.rate * item.cd_per / 100)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">CGST ({item.cgst_per}%):</span>
                              <span className="text-orange-400">₹{((item.qty * item.rate - item.cd_rs - (item.qty * item.rate * item.cd_per / 100)) * item.cgst_per / 100).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">SGST ({item.sgst_per}%):</span>
                              <span className="text-orange-400">₹{((item.qty * item.rate - item.cd_rs - (item.qty * item.rate * item.cd_per / 100)) * item.sgst_per / 100).toFixed(2)}</span>
                            </div>
                            <div className="border-t border-gray-700 my-1"></div>
                            <div className="flex justify-between font-bold">
                              <span className="text-gray-300">Total:</span>
                              <span className="text-white">₹{item.amount.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-3 relative group/btn">
                    <input
                      type="number"
                      value={item.mrp === 0 ? '' : item.mrp}
                      onChange={(e) => updateItem(index, 'mrp', e.target.value)}
                      className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                    {item.medicine_name && item.mrp > 0 && (
                      <div className="absolute z-[99999] bottom-full left-0 mb-2 hidden group-hover/btn:block w-56">
                        <div className="bg-gray-900 border border-purple-500 rounded-lg p-3 shadow-xl">
                          <p className="text-white font-semibold text-sm mb-2">{item.medicine_name}</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-400">MRP:</span>
                              <span className="text-purple-400">₹{item.mrp.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Rate:</span>
                              <span className="text-green-400">₹{item.rate.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Margin:</span>
                              <span className="text-yellow-400">₹{(item.mrp - item.rate).toFixed(2)} ({item.mrp > 0 ? (((item.mrp - item.rate) / item.mrp) * 100).toFixed(1) : 0}%)</span>
                            </div>
                            <div className="border-t border-gray-700 my-1"></div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Taxable:</span>
                              <span className="text-white">₹{(item.qty * item.rate - item.cd_rs - (item.qty * item.rate * item.cd_per / 100)).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">CGST ({item.cgst_per}%):</span>
                              <span className="text-orange-400">₹{((item.qty * item.rate - item.cd_rs - (item.qty * item.rate * item.cd_per / 100)) * item.cgst_per / 100).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">SGST ({item.sgst_per}%):</span>
                              <span className="text-orange-400">₹{((item.qty * item.rate - item.cd_rs - (item.qty * item.rate * item.cd_per / 100)) * item.sgst_per / 100).toFixed(2)}</span>
                            </div>
                            <div className="border-t border-gray-700 my-1"></div>
                            <div className="flex justify-between font-bold">
                              <span className="text-gray-300">Total:</span>
                              <span className="text-white">₹{item.amount.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      value={item.qty === 0 ? '' : item.qty}
                      onChange={(e) => updateItem(index, 'qty', e.target.value)}
                      className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      value={item.free_qty === 0 ? '' : item.free_qty}
                      onChange={(e) => updateItem(index, 'free_qty', e.target.value)}
                      className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      value={item.cgst_per === 0 ? '' : item.cgst_per}
                      onChange={(e) => updateItem(index, 'cgst_per', e.target.value)}
                      className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      value={item.sgst_per === 0 ? '' : item.sgst_per}
                      onChange={(e) => updateItem(index, 'sgst_per', e.target.value)}
                      className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      value={item.cd_rs === 0 ? '' : item.cd_rs}
                      onChange={(e) => updateItem(index, 'cd_rs', e.target.value)}
                      className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      value={item.cd_per === 0 ? '' : item.cd_per}
                      onChange={(e) => updateItem(index, 'cd_per', e.target.value)}
                      className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-3 text-white font-medium">
                    ₹{item.amount.toFixed(2)}
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

      {/* ── Auto-updating Bill Summary ── */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 mb-6 overflow-hidden">
        {/* Summary rows */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-white/10">
          {/* Subtotal */}
          <div className="flex flex-col items-center justify-center py-4 px-3 gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subtotal</span>
            <span className="text-lg font-bold text-white">₹{totals.subtotal.toFixed(2)}</span>
          </div>
          {/* CGST */}
          <div className="flex flex-col items-center justify-center py-4 px-3 gap-1">
            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">CGST</span>
            <span className="text-lg font-bold text-white">₹{totals.totalCgst.toFixed(2)}</span>
          </div>
          {/* SGST */}
          <div className="flex flex-col items-center justify-center py-4 px-3 gap-1">
            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">SGST</span>
            <span className="text-lg font-bold text-white">₹{totals.totalSgst.toFixed(2)}</span>
          </div>
          {/* Item CD */}
          <div className="flex flex-col items-center justify-center py-4 px-3 gap-1">
            <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest">Item CD</span>
            <span className="text-lg font-bold text-red-400">-₹{totals.totalCd.toFixed(2)}</span>
          </div>
          {/* Global CD */}
          <div className="flex flex-col items-center justify-center py-4 px-3 gap-1">
            <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest">
              Global CD {globalCdPer > 0 ? `(${globalCdPer}%)` : ''}
            </span>
            <span className="text-lg font-bold text-red-400">-₹{totals.globalDiscount.toFixed(2)}</span>
          </div>
          {/* Extra Credit */}
          <div className="flex flex-col items-center justify-center py-4 px-3 gap-1">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Extra Credit</span>
            <span className="text-lg font-bold text-red-400">-₹{extraCredit.toFixed(2)}</span>
          </div>
        </div>

        {/* Grand Total + Save */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/20 bg-white/5">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Grand Total (incl. GST)</p>
            <p className="text-3xl font-extrabold text-white tracking-tight">
              ₹{totals.grandTotal.toFixed(2)}
            </p>
          </div>
          <button
            onClick={savePurchase}
            disabled={saving}
            className="bg-green-600 hover:bg-green-500 active:scale-95 text-white px-10 py-3 rounded-xl font-bold text-base shadow-lg shadow-green-900/30 disabled:opacity-50 transition-all"
          >
            {saving ? '⏳ Saving...' : '💾 Save Purchase'}
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Upload or Capture Invoice</h3>
            <p className="text-gray-400 mb-4">Upload PDF, CSV, Excel, ZIP, DAV, DAC, or Image scans. You can also capture a window (like Word or an email) using the Screen Capture button.</p>
            
            <div className="flex flex-col gap-4 mb-4">
              <input
                type="file"
                accept=".pdf,.csv,.xlsx,.xls,.zip,.dav,.dac,image/*"
                onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
              />
              
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">OR</span>
                <button
                  onClick={captureScreen}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                  title="Take a screenshot of another window (e.g. Word, Email)"
                >
                  <Camera size={16} />
                  Capture Screen / Window
                </button>
              </div>

              {uploadedFile && (
                <div className="bg-white/5 border border-white/10 p-2 rounded text-sm text-green-400 flex justify-between items-center">
                  <span className="truncate max-w-[250px]">{uploadedFile.name}</span>
                  <button onClick={() => setUploadedFile(null)} className="text-red-400 hover:text-red-300 ml-2">✕</button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowUploadModal(false); setUploadedFile(null); }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleFileUpload}
                disabled={!uploadedFile}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Upload & Parse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Distributor Modal */}
      {showDistributorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Distributor</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Name *</label>
                <input
                  type="text"
                  value={newDistributor.name}
                  onChange={(e) => setNewDistributor({ ...newDistributor, name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Distributor name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Phone</label>
                <input
                  type="tel"
                  value={newDistributor.phone}
                  onChange={(e) => setNewDistributor({ ...newDistributor, phone: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+91 98765 43210"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={newDistributor.email}
                  onChange={(e) => setNewDistributor({ ...newDistributor, email: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="distributor@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Address</label>
                <textarea
                  value={newDistributor.address}
                  onChange={(e) => setNewDistributor({ ...newDistributor, address: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Full address"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">State Code</label>
                <input
                  type="text"
                  value={newDistributor.state_code}
                  onChange={(e) => setNewDistributor({ ...newDistributor, state_code: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 27 (Maharashtra)"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDistributorModal(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveDistributor}
                disabled={savingDistributor || !newDistributor.name}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {savingDistributor ? 'Saving...' : 'Add Distributor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Medicine Modal */}
      {showMedicineModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Medicine</h3>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Row 1 - Full width */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Medicine Name *</label>
                <input
                  type="text"
                  value={newMedicine.name}
                  onChange={(e) => setNewMedicine({ ...newMedicine, name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Medicine name"
                />
              </div>

              {/* Row 2 - Type & Generic */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Type *</label>
                <select
                  value={newMedicine.pack_unit}
                  onChange={(e) => setNewMedicine({ ...newMedicine, pack_unit: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Tablet">Tablet (Tab)</option>
                  <option value="Capsule">Capsule (Cap)</option>
                  <option value="Syrup">Syrup</option>
                  <option value="Solution">Solution</option>
                  <option value="Suspension">Suspension</option>
                  <option value="Drop">Drop</option>
                  <option value="Injection">Injection</option>
                  <option value="Cream">Cream</option>
                  <option value="Ointment">Ointment</option>
                  <option value="Gel">Gel</option>
                  <option value="Powder">Powder</option>
                  <option value="Inhaler">Inhaler</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Generic Name</label>
                <input
                  type="text"
                  value={newMedicine.generic_name}
                  onChange={(e) => setNewMedicine({ ...newMedicine, generic_name: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Paracetamol"
                />
              </div>

              {/* Row 3 - Strength & Pack */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Strength</label>
                <input
                  type="text"
                  value={newMedicine.strength}
                  onChange={(e) => setNewMedicine({ ...newMedicine, strength: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 500mg, 10ml"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Pack</label>
                <input
                  type="text"
                  value={newMedicine.pack_size}
                  onChange={(e) => setNewMedicine({ ...newMedicine, pack_size: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 1x10 Tab, 1x30 Cap"
                />
              </div>

              {/* Row 4 - Mfg & Mkdt */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Mfg (Manufacturer)</label>
                <input
                  type="text"
                  value={newMedicine.manufacturer}
                  onChange={(e) => setNewMedicine({ ...newMedicine, manufacturer: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Cipla Ltd"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Mkdt (Marketed By)</label>
                <input
                  type="text"
                  value={newMedicine.marketed_by}
                  onChange={(e) => setNewMedicine({ ...newMedicine, marketed_by: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Cipla Pvt Ltd"
                />
              </div>

              {/* Row 5 - Tax */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">CGST %</label>
                <input
                  type="number"
                  value={newMedicine.cgst_per}
                  onChange={(e) => setNewMedicine({ ...newMedicine, cgst_per: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">SGST %</label>
                <input
                  type="number"
                  value={newMedicine.sgst_per}
                  onChange={(e) => setNewMedicine({ ...newMedicine, sgst_per: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Row 6 - HSN */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">HSN Code</label>
                <input
                  type="text"
                  value={newMedicine.hsn_code}
                  onChange={(e) => setNewMedicine({ ...newMedicine, hsn_code: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 3004"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowMedicineModal(false); setActiveMedicineIndex(null); }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveMedicine}
                disabled={savingMedicine || !newMedicine.name}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {savingMedicine ? 'Saving...' : 'Add Medicine'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price History Modal */}
      {showPriceHistoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-2">Price History</h3>
            <p className="text-gray-400 text-sm mb-4">Past purchase prices for: <span className="text-white">{priceHistoryMedicine}</span></p>
            
            {priceHistory.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No purchase history found for this medicine</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-300 border-b border-white/20">
                      <th className="pb-3">Date</th>
                      <th className="pb-3">Distributor</th>
                      <th className="pb-3">Batch</th>
                      <th className="pb-3">Rate</th>
                      <th className="pb-3">MRP</th>
                      <th className="pb-3">CGST%</th>
                      <th className="pb-3">SGST%</th>
                      <th className="pb-3">CD ₹</th>
                      <th className="pb-3">CD %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b border-white/10 hover:bg-white/5">
                        <td className="py-3 text-gray-300">{item.date}</td>
                        <td className="py-3 text-white">{item.distributor_name}</td>
                        <td className="py-3 text-gray-300">{item.batch_no}</td>
                        <td className="py-3 text-white font-medium">₹{item.rate}</td>
                        <td className="py-3 text-white">₹{item.mrp}</td>
                        <td className="py-3 text-gray-300">{item.cgst_per}%</td>
                        <td className="py-3 text-gray-300">{item.sgst_per}%</td>
                        <td className="py-3 text-gray-300">₹{item.cd_rs || 0}</td>
                        <td className="py-3 text-gray-300">{item.cd_per || 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowPriceHistoryModal(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Purchase Modal */}
      {editingPurchase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Purchase</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Invoice Number</label>
                <input
                  type="text"
                  value={editingPurchase.invoice_no || ''}
                  onChange={(e) => setEditingPurchase({ ...editingPurchase, invoice_no: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Date</label>
                <input
                  type="date"
                  value={editingPurchase.date || ''}
                  onChange={(e) => setEditingPurchase({ ...editingPurchase, date: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Total Amount</label>
                <input
                  type="number"
                  value={editingPurchase.total_amount || 0}
                  onChange={(e) => setEditingPurchase({ ...editingPurchase, total_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                  step="0.01"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingPurchase(null)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await apiClient.put(`/purchases/${editingPurchase.id}`, {
                      invoice_no: editingPurchase.invoice_no,
                      date: editingPurchase.date,
                      total_amount: editingPurchase.total_amount
                    });
                    setEditingPurchase(null);
                    alert('Purchase updated successfully');
                  } catch (error) {
                    alert('Failed to update purchase');
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showCamera && (
        <AICamera 
          onClose={() => { setShowCamera(false); setCameraTargetIndex(null); }}
          onScanResult={handleCameraScanResult}
        />
      )}
    </div>
  );
};

export default Purchases;