import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Minus, Sparkles, Loader2, ShoppingCart, RefreshCw, Clock, Eye } from 'lucide-react';
import { api, type SpecialOrder, type Refill } from '../services/api';
import { toastEvent, liveCartAddEvent } from '../services/events';

interface SuggestionMedicine {
  medicine_name: string;
  isPharmarack?: boolean;
  distributor?: string;
  rate?: number;
  mapped?: boolean;
  packaging?: string;
  stock?: string;
  isErrorMessage?: boolean;
  scheme?: string;
  productId?: string | number;
  storeId?: string | number;
  productCode?: string;
  company?: string;
  mrp?: number;
}

const getStockStyle = (stockStr: string | undefined): string => {
  if (!stockStr) return 'bg-bg3 text-muted border border-border';
  const stock = stockStr.trim();
  
  if (stock.toLowerCase() === 'high') {
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  }
  if (stock.toLowerCase() === 'medium') {
    return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
  }
  if (stock.toLowerCase() === 'low' || stock.toLowerCase() === 'out of stock' || stock.toLowerCase() === 'no stock' || stock === '0') {
    return 'bg-red-500/10 text-red border border-red-500/20';
  }
  
  const num = parseInt(stock);
  if (!isNaN(num)) {
    if (num >= 50) {
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    } else if (num >= 15) {
      return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    } else {
      return 'bg-red-500/10 text-red border border-red-500/20';
    }
  }
  
  return 'bg-bg3 text-muted border border-border';
};

const getStockScore = (stockStr: string | undefined): number => {
  if (!stockStr) return 0;
  const stock = stockStr.trim().toLowerCase();
  
  if (stock === 'high') return 3;
  if (stock === 'medium') return 2;
  if (stock === 'low') return 1;
  if (stock === 'out of stock' || stock === 'no stock' || stock === '0') return -1;
  
  const num = parseInt(stock);
  if (!isNaN(num)) {
    if (num >= 50) return 3;
    if (num >= 15) return 2;
    if (num > 0) return 1;
    return -1;
  }
  
  return 0;
};

interface CartLineItem {
  productId: number | null;
  storeId: number;
  productCode: string;
  productName: string;
  company: string;
  packaging: string;
  qty: number;
  ptr: number;
  mrp: number;
  scheme: string;
  stock: number | null;
  amount: number;
  cartSource: string;
  isChecked: boolean;
  createdDate: string;
}

interface Distributor {
  storeId: number;
  storeName: string;
  lineTotal: number;
  deliveryPersons: { name: string; code: string }[];
  items: CartLineItem[];
}

interface SchemeInfo {
  buy: number;
  free: number;
}

const parseScheme = (schemeStr: string | undefined): SchemeInfo | null => {
  if (!schemeStr) return null;
  const match = schemeStr.match(/^(\d+)\+(\d+)$/);
  if (match) {
    return {
      buy: parseInt(match[1]),
      free: parseInt(match[2])
    };
  }
  return null;
};

const getEffectiveRate = (rate: number, schemeStr: string | undefined, qty: number): number => {
  if (!rate) return 0;
  const scheme = parseScheme(schemeStr);
  if (!scheme || qty < scheme.buy) {
    return rate;
  }
  const freeItems = Math.floor(qty / scheme.buy) * scheme.free;
  const totalItems = qty + freeItems;
  return (qty * rate) / totalItems;
};

const getDosageType = (name: string): 'liquid' | 'solid' | 'other' => {
  const n = name.toLowerCase();
  if (/\b(syrup|syp|syp\.|suspension|susp|susp\.|liquid|drop|drops|solution|emulsion|elixir)\b/i.test(n)) {
    return 'liquid';
  }
  if (/\b(tablet|tab|tabs|tab\.|capsule|cap|caps|cap\.)\b/i.test(n)) {
    return 'solid';
  }
  return 'other';
};

const getDosageSubtype = (name: string): string => {
  const n = name.toLowerCase();
  if (/\b(syrup|syp|syp\.|bottle syp)\b/i.test(n)) {
    return 'syrup';
  }
  if (/\b(drop|drops|oral drop|oral drops)\b/i.test(n)) {
    return 'drops';
  }
  if (/\b(suspension|susp|susp\.)\b/i.test(n)) {
    return 'suspension';
  }
  if (/\b(tablet|tab|tabs|tab\.|sr|xr|tablet\s+sr)\b/i.test(n)) {
    return 'tablet';
  }
  if (/\b(capsule|cap|caps|cap\.)\b/i.test(n)) {
    return 'capsule';
  }
  if (/\b(injection|inj|inj\.)\b/i.test(n)) {
    return 'injection';
  }
  if (/\b(cream|gel|ointment|oint|oint\.)\b/i.test(n)) {
    return 'topical';
  }
  return 'other';
};

const isMatchDosage = (targetName: string, itemName: string, itemPackaging: string): boolean => {
  const targetText = targetName.toLowerCase();
  const itemText = (itemName + ' ' + (itemPackaging || '')).toLowerCase();

  const targetType = getDosageType(targetText);
  const itemType = getDosageType(itemText);

  // Enforce general liquid vs solid mismatch
  if (targetType === 'liquid' && itemType === 'solid') return false;
  if (targetType === 'solid' && itemType === 'liquid') return false;

  // Enforce fine-grained subtype match if both specify a subtype
  const targetSubtype = getDosageSubtype(targetText);
  const itemSubtype = getDosageSubtype(itemText);

  if (targetSubtype !== 'other' && itemSubtype !== 'other') {
    return targetSubtype === itemSubtype;
  }

  return true;
};

const cleanQueryForSearch = (query: string): string => {
  const cleaned = query
    .replace(/\b(syrup|syp|suspension|susp|tablet|tab|tablets|tabs|capsule|cap|capsules|caps|injection|inj|drops|drop|solution)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 3 ? cleaned : query;
};

export const LiveCartAddModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [isOpen, setIsOpen] = useState(true);
  
  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };
  
  // Input fields
  const [product, setProduct] = useState('');
  const [qty, setQty] = useState<number | ''>(1);
  
  // Selected Pharmarack Metadata
  const [selectedDistributor, setSelectedDistributor] = useState('');
  const [selectedRate, setSelectedRate] = useState<number | ''>('');
  const [selectedMrp, setSelectedMrp] = useState<number | ''>('');
  const [selectedMapped, setSelectedMapped] = useState<boolean | null>(null);
  const [selectedScheme, setSelectedScheme] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | number>('');
  const [selectedStoreId, setSelectedStoreId] = useState<string | number>('');
  const [selectedProductCode, setSelectedProductCode] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedPackaging, setSelectedPackaging] = useState('');
  const [selectedMedicineName, setSelectedMedicineName] = useState('');

  // Suggestions Search
  const [suggestions, setSuggestions] = useState<SuggestionMedicine[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  // Portal position for the dropdown (avoids overflow:auto clipping)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [linkedPendingItem, setLinkedPendingItem] = useState<any | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prMode, setPrMode] = useState<'Live' | 'Unknown'>('Unknown');

  // Cart Preview States
  const [cartDistributors, setCartDistributors] = useState<Distributor[]>([]);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);

  // Reconciliation States
  const [reconciliationList, setReconciliationList] = useState<any[]>([]);

  // Investigation Modal States & Actions
  const [resolvingUid, setResolvingUid] = useState<number | null>(null);

  const handleResolveManually = async (uid: number) => {
    try {
      setResolvingUid(uid);
      const result = await api.resolveOrderManually(uid);
      toastEvent.trigger('Order successfully ignored/resolved.', 'success');
      await fetchReconciliationList();
    } catch (err: any) {
      console.error('Resolve manually error:', err);
      toastEvent.trigger('Failed to resolve order: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setResolvingUid(null);
    }
  };

  // Pending Orders States and Functions
  const [pendingOrders, setPendingOrders] = useState<SpecialOrder[]>([]);

  // Pending Refills States and Functions
  const [pendingRefills, setPendingRefills] = useState<Refill[]>([]);

  const fetchPendingOrders = async () => {
    try {
      const data = await api.getOrders();
      if (Array.isArray(data)) {
        // Show all pending or ordered requests (no same-day date constraint)
        const filtered = data.filter(o => o.status === 'Pending' || o.status === 'Ordered');
        setPendingOrders(filtered);
      }
    } catch (err) {
      console.error('Failed to fetch pending special orders in modal:', err);
    }
  };

  const fetchPendingRefills = async () => {
    try {
      const data = await api.getRefills();
      if (Array.isArray(data)) {
        const filtered = data.filter(r => 
          r.is_active === 1 && 
          r.status === 'pending' && 
          r.hold_for_stock === 1
        );
        setPendingRefills(filtered);
      }
    } catch (err) {
      console.error('Failed to fetch pending refills in modal:', err);
    }
  };

  const fetchReconciliationList = async () => {
    try {
      const data = await api.getReconciliationList();
      if (Array.isArray(data)) {
        const missing = data.filter(o => o.status === 'Missing' && !o.is_saved);
        setReconciliationList(missing);
      }
    } catch (err) {
      console.error('Failed to fetch reconciliation list in modal:', err);
    }
  };

  const getReconciliationItemInCart = (medName: string) => {
    const nameNorm = medName.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const dist of cartDistributors) {
      for (const item of dist.items) {
        const cartNameNorm = item.productName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cartNameNorm.includes(nameNorm) || nameNorm.includes(cartNameNorm)) {
          return item;
        }
      }
    }
    return null;
  };



  const getRefillItemInCart = (refill: Refill) => {
    const refillNameNorm = (refill.medicine_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const dist of cartDistributors) {
      for (const item of dist.items) {
        const cartNameNorm = item.productName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cartNameNorm.includes(refillNameNorm) || refillNameNorm.includes(cartNameNorm)) {
          return item;
        }
      }
    }
    return null;
  };



  const getOrderItemInCart = (order: SpecialOrder) => {
    const orderNameNorm = order.product.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const dist of cartDistributors) {
      for (const item of dist.items) {
        const cartNameNorm = item.productName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cartNameNorm.includes(orderNameNorm) || orderNameNorm.includes(cartNameNorm)) {
          return item;
        }
      }
    }
    return null;
  };

  const handleStartPickingForForm = (item: any) => {
    setProduct(item.name);
    setQty(item.qtyToOrder || 1);
    setLinkedPendingItem(item);
    
    // Reset selected product/distributor states
    setSelectedDistributor('');
    setSelectedRate('');
    setSelectedMrp('');
    setSelectedMapped(null);
    setSelectedScheme('');
    setSelectedProductId('');
    setSelectedStoreId('');
    setSelectedProductCode('');
    setSelectedCompany('');
    setSelectedPackaging('');
    setSelectedMedicineName('');

    setTimeout(() => {
      productInputRef.current?.focus();
      productInputRef.current?.select();
    }, 50);
  };



  // Cheaper option state
  const [cheaperDistributor, setCheaperDistributor] = useState<any | null>(null);

  const autocompleteRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const ignoreNextSearchRef = useRef(false);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const handleSwitchToCheaper = () => {
    if (cheaperDistributor) {
      setSelectedDistributor(cheaperDistributor.distributor || '');
      setSelectedRate(cheaperDistributor.rate !== undefined && cheaperDistributor.rate !== null ? cheaperDistributor.rate : '');
      setSelectedMrp(cheaperDistributor.mrp !== undefined && cheaperDistributor.mrp !== null ? cheaperDistributor.mrp : '');
      setSelectedMapped(cheaperDistributor.mapped !== undefined ? cheaperDistributor.mapped : null);
      setSelectedScheme(cheaperDistributor.scheme || '');
      setSelectedProductId(cheaperDistributor.productId || '');
      setSelectedStoreId(cheaperDistributor.storeId || '');
      setSelectedProductCode(cheaperDistributor.productCode || '');
      setSelectedCompany(cheaperDistributor.company || '');
      setSelectedPackaging(cheaperDistributor.packaging || '');
      setSelectedMedicineName(cheaperDistributor.medicine_name || '');
      toastEvent.trigger(`Switched to cheaper option from ${cheaperDistributor.distributor}!`, 'success');
    }
  };

  useEffect(() => {
    if (selectedStoreId && selectedProductId && selectedRate !== '' && selectedMedicineName) {
      const currentEff = getEffectiveRate(Number(selectedRate), selectedScheme, Number(qty) || 1);
      
      let bestOption: any = null;
      let bestEff = currentEff;

      suggestions.forEach(item => {
        if (item.storeId !== selectedStoreId && item.rate) {
          const nameClean1 = item.medicine_name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const nameClean2 = selectedMedicineName.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (nameClean1 === nameClean2 && item.rate) {
            const itemEff = getEffectiveRate(item.rate, item.scheme, Number(qty) || 1);
            if (itemEff < bestEff - 0.01) {
              bestEff = itemEff;
              bestOption = {
                ...item,
                effectiveRate: itemEff
              };
            }
          }
        }
      });

      setCheaperDistributor(bestOption);
    } else {
      setCheaperDistributor(null);
    }
  }, [selectedStoreId, selectedProductId, selectedRate, selectedScheme, qty, suggestions, selectedMedicineName]);

  // Find the minimum effective rate among all suggestions to identify the best rate option
  const minEffectiveRate = React.useMemo(() => {
    let min = Infinity;
    suggestions.forEach(item => {
      if (item.isErrorMessage || !item.rate) return;
      const eff = getEffectiveRate(item.rate, item.scheme, Number(qty) || 1);
      if (eff < min) {
        min = eff;
      }
    });
    return min;
  }, [suggestions, qty]);

  // fetchCart logic
  const fetchCart = async () => {
    setCartLoading(true);
    setCartError(null);
    try {
      const data = await api.getPharmarackCart();
      if (data && data.success) {
        setCartDistributors(data.distributors || []);
      } else {
        setCartError('Failed to retrieve cart details.');
      }
    } catch (err: any) {
      console.error('Failed to fetch Pharmarack cart in modal:', err);
      setCartError(err?.response?.data?.error || err?.message || 'Error fetching cart');
    } finally {
      setCartLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCart();
      fetchPendingOrders();
      fetchPendingRefills();
      fetchReconciliationList();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleRefresh = () => {
      if (isOpen) {
        fetchCart();
        fetchPendingOrders();
        fetchPendingRefills();
        fetchReconciliationList();
      }
    };
    window.addEventListener('refresh-pharmarack-cart', handleRefresh);
    return () => window.removeEventListener('refresh-pharmarack-cart', handleRefresh);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const fetchSessionStatus = async () => {
        try {
          const data = await api.checkPharmarackSession();
          setPrMode(data.mode || 'Live');
        } catch (err) {
          console.error('Failed to fetch Pharmarack session status in live add modal:', err);
          setPrMode('Live');
        }
      };
      fetchSessionStatus();
    }
  }, [isOpen]);

  // Autofocus on mount
  useEffect(() => {
    setTimeout(() => {
      productInputRef.current?.focus();
    }, 100);
  }, []);

  // Listen to Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle clicking outside to dismiss search results
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        autocompleteRef.current && 
        !autocompleteRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Live Query autocomplete
  useEffect(() => {
    if (ignoreNextSearchRef.current) {
      ignoreNextSearchRef.current = false;
      return;
    }

    if (product.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const cleanedProduct = cleanQueryForSearch(product);
        const prData = await api.searchPharmarack(cleanedProduct).catch((err: any) => {
          const errMsg = err?.response?.data?.error || 'Connection error, please check internet or reconnect';
          return { isError: true, message: errMsg };
        });

        const mergedList: SuggestionMedicine[] = [];

        if (prData && (prData as any).isError) {
          mergedList.push({
            medicine_name: `⚠️ ${(prData as any).message}`,
            isPharmarack: true,
            isErrorMessage: true
          });
        } else if (Array.isArray(prData)) {
          if (prData.length === 0) {
            toastEvent.trigger('No matching distributor offers found.', 'info');
          }
          
          const targetDosageName = linkedPendingItem ? linkedPendingItem.name : product;
          prData.forEach((item: any) => {
            if (isMatchDosage(targetDosageName, item.name, item.packaging)) {
              // Hide item if stock is 0 (out of stock, no stock, etc.)
              if (getStockScore(item.stock) !== -1) {
                mergedList.push({
                  medicine_name: item.name,
                  mrp: item.mrp,
                  isPharmarack: true,
                  distributor: item.distributor,
                  rate: item.rate,
                  mapped: item.mapped,
                  packaging: item.packaging,
                  stock: item.stock,
                  scheme: item.scheme,
                  productId: item.productId,
                  storeId: item.storeId,
                  productCode: item.productCode,
                  company: item.company
                });
              }
            }
          });

          // Sort suggestions based on priority:
          // 1. Linked distributor match (if active and specified)
          // 2. Mapped distributors (mapped === true)
          // 3. Stock availability (higher stockScore first)
          // 4. Rate (cheaper PTR first)
          mergedList.sort((a, b) => {
            // 1. Linked distributor match
            if (linkedPendingItem && linkedPendingItem.patientName && !linkedPendingItem.patientName.toLowerCase().includes('unknown')) {
              const distName = linkedPendingItem.patientName.toLowerCase().replace(/[^a-z0-9]/g, '');
              const aDist = (a.distributor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const bDist = (b.distributor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const aMatch = aDist.includes(distName) || distName.includes(aDist);
              const bMatch = bDist.includes(distName) || distName.includes(bDist);
              if (aMatch && !bMatch) return -1;
              if (!aMatch && bMatch) return 1;
            }

            // 2. Mapped distributors first
            const aMapped = a.mapped ? 1 : 0;
            const bMapped = b.mapped ? 1 : 0;
            if (aMapped !== bMapped) {
              return bMapped - aMapped;
            }

            // 3. Stock priority
            const aStock = getStockScore(a.stock);
            const bStock = getStockScore(b.stock);
            if (aStock !== bStock) {
              return bStock - aStock;
            }

            // 4. Rate priority
            const aRate = a.rate || Infinity;
            const bRate = b.rate || Infinity;
            return aRate - bRate;
          });
        }

        setSuggestions(mergedList);
        setShowSuggestions(mergedList.length > 0);
        setActiveSuggestionIndex(-1);
      } catch (err) {
        console.error('Error searching Pharmarack live catalog:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [product]);

  // Keep the dropdown positioned correctly under the input even when the modal scrolls
  useEffect(() => {
    const updatePosition = () => {
      if (showSuggestions && suggestions.length > 0 && productInputRef.current) {
        const rect = productInputRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      } else {
        setDropdownPos(null);
      }
    };

    updatePosition();

    if (showSuggestions && suggestions.length > 0) {
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showSuggestions, suggestions]);

  const handleProductChange = (val: string) => {
    setProduct(val);
    if (selectedProductId) {
      setSelectedDistributor('');
      setSelectedRate('');
      setSelectedMrp('');
      setSelectedMapped(null);
      setSelectedScheme('');
      setSelectedProductId('');
      setSelectedStoreId('');
      setSelectedProductCode('');
      setSelectedCompany('');
      setSelectedPackaging('');
      setSelectedMedicineName('');
    }
  };

  const selectSuggestion = (med: SuggestionMedicine) => {
    if (med.isErrorMessage) return;
    ignoreNextSearchRef.current = true;
    
    setProduct(`${med.medicine_name} (${med.packaging})`);
    setSelectedDistributor(med.distributor || '');
    setSelectedRate(med.rate !== undefined && med.rate !== null ? med.rate : '');
    setSelectedMrp(med.mrp !== undefined && med.mrp !== null ? med.mrp : '');
    setSelectedMapped(med.mapped !== undefined ? med.mapped : null);
    setSelectedScheme(med.scheme || '');
    setSelectedProductId(med.productId || '');
    setSelectedStoreId(med.storeId || '');
    setSelectedProductCode(med.productCode || '');
    setSelectedCompany(med.company || '');
    setSelectedPackaging(med.packaging || '');
    setSelectedMedicineName(med.medicine_name || '');

    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);

    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 50);
  };

  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev + 1) % suggestions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
        selectSuggestion(suggestions[activeSuggestionIndex]);
      } else {
        handleSubmit(e);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProductId || !selectedStoreId) {
      toastEvent.trigger('Please search and select a matching distributor product from the dropdown list.', 'error');
      return;
    }

    if (!qty || Number(qty) < 1) {
      toastEvent.trigger('Quantity must be at least 1.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.addPharmarackCart([{
        productId: selectedProductId,
        storeId: selectedStoreId,
        qty: Number(qty) || 1,
        rate: selectedRate !== '' ? Number(selectedRate) : undefined,
        scheme: selectedScheme || undefined,
        productCode: selectedProductCode,
        company: selectedCompany,
        productName: selectedMedicineName || product.trim(),
        storeName: selectedDistributor,
        packaging: selectedPackaging,
        mapped: selectedMapped === false ? false : true
      }]);

      toastEvent.trigger(`Added "${product}" directly to live Pharmarack cart!`, 'success');
      
      if (linkedPendingItem) {
        try {
          if (linkedPendingItem.type === 'order') {
            await api.updateOrder(linkedPendingItem.orderRef.id, { status: 'Ordered' });
            await fetchPendingOrders();
          } else if (linkedPendingItem.type === 'refill') {
            await fetchPendingRefills();
          } else if (linkedPendingItem.type === 'reconcile') {
            await fetchReconciliationList();
          }
        } catch (err) {
          console.error('Failed to update status of linked pending item:', err);
        }
        setLinkedPendingItem(null);
      }

      // Reset form and keep open
      setProduct('');
      setQty(1);
      setSelectedDistributor('');
      setSelectedRate('');
      setSelectedMrp('');
      setSelectedMapped(null);
      setSelectedScheme('');
      setSelectedProductId('');
      setSelectedStoreId('');
      setSelectedProductCode('');
      setSelectedCompany('');
      setSelectedPackaging('');
      setSelectedMedicineName('');
      
      // Focus back to search input so user can add another medicine
      setTimeout(() => {
        productInputRef.current?.focus();
      }, 100);
      
      // Refresh any active cart indicators in the header/sidebar
      window.dispatchEvent(new CustomEvent('refresh-pharmarack-cart'));
    } catch (cartErr: any) {
      console.error('Failed to add live cart item:', cartErr);
      const detailedError = cartErr?.response?.data?.details || cartErr?.response?.data?.error || cartErr?.message || 'Unknown error';
      toastEvent.trigger(`Live addition failed: ${detailedError}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalProducts = cartDistributors.reduce((s, d) => s + d.items.length, 0);
  const totalQty = cartDistributors.reduce((s, d) => s + d.items.reduce((q, i) => q + i.qty, 0), 0);
  const totalAmount = cartDistributors.reduce((s, d) => s + d.items.reduce((a, i) => a + i.amount, 0), 0);

  // Map and sort special orders, refills, and reconciliation orders into a single list
  const unifiedPendingActions = [
    ...pendingOrders.map(order => ({
      key: `order-${order.id}`,
      type: 'order' as const,
      name: order.product,
      patientName: order.requester,
      qty: order.qty,
      date: order.date,
      inCart: !!getOrderItemInCart(order),
      qtyToOrder: order.qty,
      orderRef: order,
      targetMrp: null
    })),
    ...pendingRefills.map(refill => ({
      key: `refill-${refill.id}`,
      type: 'refill' as const,
      name: refill.medicine_name || `Medicine ID: ${refill.medicine_id}`,
      patientName: refill.patient_name,
      qty: null,
      date: refill.next_refill_date,
      inCart: !!getRefillItemInCart(refill),
      qtyToOrder: 1,
      orderRef: refill,
      targetMrp: null
    })),
    ...reconciliationList.flatMap(recon => 
      (recon.medicine_names || []).map((medName: string, idx: number) => {
        const itemKey = `recon-${recon.email_uid}-${medName}`;
        const targetMrp = recon.medicine_details?.[medName]?.mrp;
        return {
          key: itemKey,
          type: 'reconcile' as const,
          name: medName,
          patientName: recon.extracted_distributor || 'Unknown Distributor',
          qty: null,
          date: recon.date,
          inCart: !!getReconciliationItemInCart(medName),
          qtyToOrder: 1,
          orderRef: recon,
          targetMrp: targetMrp
        };
      })
    )
  ].sort((a, b) => {
    if (a.inCart !== b.inCart) {
      return a.inCart ? 1 : -1;
    }
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-global-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
      {/* ponytail: fix height to h-[85vh] to prevent modal size from jumping when cart preview loads */}
      <div className="glass-panel max-w-5xl lg:max-w-6xl xl:max-w-7xl w-full h-[85vh] max-h-[85vh] p-5 md:p-6 relative border border-glass-border shadow-[0_0_60px_rgba(59,130,246,0.25)] bg-bg2 text-text animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        
        {/* Close Button */}
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 text-muted hover:text-text rounded-lg hover:bg-bg3 transition-all"
          title="Close Modal (Esc)"
        >
          <X size={18} />
        </button>

        {/* Refresh Button */}
        <button 
          type="button"
          onClick={fetchCart}
          disabled={cartLoading}
          className="absolute top-4 right-4 md:right-[33.33%] md:mr-2.5 p-1.5 text-muted hover:text-text rounded-lg hover:bg-bg3 transition-all flex items-center justify-center disabled:opacity-50"
          title="Refresh Cart"
        >
          <RefreshCw size={14} className={cartLoading ? 'animate-spin text-emerald-400' : ''} />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-glass-border/30 flex-1 overflow-hidden">
          
          {/* Left Column: Pending Orders, Refills & Unreconciled Items */}
          <div className="flex flex-col h-full overflow-hidden pr-3">
            <div className="flex items-center gap-2 border-b border-glass-border/30 pb-2.5 shrink-0">
               <h3 className="flex-1 pb-1.5 text-xs font-bold uppercase tracking-wider text-center border-b-2 border-primary text-text">
                 Pending Action ({unifiedPendingActions.length})
               </h3>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 scrollbar-thin">
              {unifiedPendingActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted">
                    <Clock size={28} className="opacity-20 mb-2" />
                    <p className="text-xs font-bold">No Pending Action</p>
                    <p className="text-[11px] max-w-[180px] mx-auto mt-0.5">No pending special orders, out-of-stock refills, or unreconciled orders found.</p>
                  </div>
              ) : (
                unifiedPendingActions.map(item => {
                  return (
                    <div 
                      key={item.key} 
                      data-picker-key={item.key}
                      className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-all shadow-sm ${
                        item.inCart 
                           ? 'bg-emerald-500/5 border-emerald-500/20'
                           : linkedPendingItem?.key === item.key
                           ? 'bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/30'
                           : item.type === 'order'
                             ? 'bg-red-500/5 border-red-500/10'
                             : item.type === 'refill'
                               ? 'bg-amber-500/5 border-amber-500/10'
                               : 'bg-sky-500/5 border-sky-500/10'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col min-w-0">
                          {/* Badge row */}
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border select-none ${
                              item.inCart
                                ? 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400'
                                : item.type === 'order'
                                  ? 'bg-red-500/15 border-red-500/20 text-red'
                                  : item.type === 'refill'
                                    ? 'bg-amber-500/15 border-amber-500/20 text-amber-400'
                                    : 'bg-sky-500/15 border-sky-500/20 text-sky-400'
                            }`}>
                              {item.type === 'order' ? 'Request' : item.type === 'refill' ? 'Refill' : 'Reconcile'}
                            </span>
                          </div>

                          <span className={`text-xs font-semibold truncate ${item.inCart ? 'line-through opacity-60 text-emerald-400' : 'text-text'}`} title={item.name}>
                            {item.name}
                          </span>
                          <span className="text-[11px] text-muted mt-0.5 truncate">
                            {item.type === 'order' 
                              ? `Customer: ${item.patientName} (Qty: ${item.qty})` 
                              : item.type === 'refill'
                                ? `Patient: ${item.patientName}`
                                : `Missing from: ${item.patientName}`
                            }
                          </span>
                          <span className="text-[9px] text-muted/70 font-mono mt-0.5">
                            {item.type === 'order'
                              ? `Date: ${new Date(item.date).toLocaleDateString('en-IN')}`
                              : item.type === 'refill'
                                ? `Next Due: ${new Date(item.date).toLocaleDateString('en-IN')}`
                                : `Order Date: ${new Date(item.date).toLocaleDateString('en-IN')}`
                            }
                          </span>
                        </div>
                        {item.inCart ? (
                          <span className="shrink-0 text-[8px] font-bold uppercase bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/20 text-emerald-400 select-none">
                            ✓ Added
                          </span>
                        ) : linkedPendingItem?.key === item.key ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLinkedPendingItem(null);
                              setProduct('');
                              setQty(1);
                            }}
                            className="shrink-0 text-[9px] font-semibold bg-bg3 hover:bg-bg3/80 border border-border px-2 py-1 rounded transition-all active:scale-95 text-muted font-sans"
                          >
                            Cancel
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.type === 'reconcile' && (
                              <button
                                type="button"
                                onClick={() => handleResolveManually(item.orderRef.email_uid)}
                                disabled={resolvingUid !== null}
                                className="text-muted hover:text-red bg-bg3 hover:bg-red/10 border border-glass-border p-1.5 rounded-lg transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
                                title="Ignore this order (Manually Resolve)"
                              >
                                <Eye size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartPickingForForm(item);
                              }}
                              className={`btn-start-picking text-[9px] font-semibold px-2 py-1 rounded transition-all active:scale-95 font-sans border ${
                                item.type === 'order'
                                  ? 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20 text-red'
                                  : item.type === 'refill'
                                    ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-500'
                                    : 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20 text-sky-400'
                              }`}
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Middle Column: Form */}
          <div className="flex flex-col h-full justify-between md:pl-6 overflow-y-auto pr-2">
            <div className="space-y-4">
              {/* Title */}
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary/10 rounded-xl text-primary border border-primary/20 shadow-sm">
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text flex items-center gap-1.5">
                    Add to Live Cart
                    <span className="text-[10px] bg-bg3 border border-border text-muted px-1.5 py-0.5 rounded font-mono">Alt + L</span>
                    {prMode !== 'Unknown' && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border leading-none bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                        ● LIVE
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-muted">Direct live stock addition for inventory replenishment</p>
                </div>
              </div>

              {/* Form Body */}
              <form id="live-cart-add-form" onSubmit={handleSubmit} className="space-y-4">
                
                {linkedPendingItem && (
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-text flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="truncate pr-2">
                      <div className="font-bold text-blue-400 text-[9px] uppercase tracking-wider mb-1">
                        {linkedPendingItem.type === 'order' ? 'Linked Customer Request' : linkedPendingItem.type === 'refill' ? 'Linked Patient Refill' : 'Linked Reconcile Item'}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-text font-semibold truncate text-xs">{linkedPendingItem.name}</span>
                        {linkedPendingItem.patientName && (
                          <span className="text-[10px] text-muted">
                            ({linkedPendingItem.type === 'reconcile' ? 'Distributor' : 'Patient'}: {linkedPendingItem.patientName})
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkedPendingItem(null);
                        setProduct('');
                        setQty(1);
                      }}
                      className="p-1 text-muted hover:text-red hover:bg-red-500/10 rounded-xl transition-all ml-2"
                      title="Clear pending item link"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Autocomplete Search Input */}
                <div className="relative animate-in fade-in duration-200" ref={autocompleteRef}>
                  <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">Medicine Search</label>
                  <div className="relative">
                    <span className="absolute left-3 top-[11.5px] text-muted">
                      {searchLoading ? <Loader2 size={16} className="animate-spin text-primary" /> : <Search size={16} />}
                    </span>
                    <input
                      ref={productInputRef}
                      type="text"
                      value={product}
                      onChange={(e) => handleProductChange(e.target.value)}
                      onKeyDown={handleProductKeyDown}
                      className="w-full premium-input pl-9 pr-4 py-2 text-sm font-medium"
                      placeholder="Search Pharmarack catalog..."
                      autoComplete="off"
                    />
                  </div>
                  
                  {showSuggestions && suggestions.length > 0 && dropdownPos && createPortal(
                    <ul
                      ref={dropdownRef}
                      className="fixed z-[9999999] max-h-[420px] overflow-y-auto bg-bg2 border border-glass-border backdrop-blur-2xl rounded-xl shadow-2xl divide-y divide-border/30 py-1 scrollbar-thin"
                      style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
                    >
                      {suggestions.map((med, index) => (
                        <li
                          key={index}
                          onClick={() => selectSuggestion(med)}
                          className={`px-4 py-2 text-sm cursor-pointer flex justify-between items-center transition-all ${
                            med.isErrorMessage
                              ? 'bg-red-500/10 text-red border-l-2 border-red cursor-default'
                              : index === activeSuggestionIndex 
                              ? 'bg-primary/20 text-text font-semibold border-l-2 border-primary' 
                              : 'text-muted hover:text-text hover:bg-bg3'
                          }`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-text truncate text-sm">{med.medicine_name}</span>
                              {med.rate !== undefined && med.rate !== null && !med.isErrorMessage && getEffectiveRate(med.rate, med.scheme, Number(qty) || 1) === minEffectiveRate && (
                                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-0.5 shrink-0 select-none">
                                  <Sparkles size={8} className="text-emerald-400 animate-pulse" /> Best Rate
                                </span>
                              )}
                              {med.stock !== undefined && !med.isErrorMessage && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${getStockStyle(med.stock)}`}>
                                  {med.stock} Stock
                                </span>
                              )}
                              {med.scheme && !med.isErrorMessage && (
                                <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                                  {med.scheme}
                                </span>
                              )}
                            </div>
                            {!med.isErrorMessage && (
                              <span className="text-[11px] text-muted block truncate mt-0.5">
                                {med.distributor ? (
                                  <>
                                    <span className={med.mapped ? 'text-text font-medium' : 'text-purple-400 font-medium'}>
                                      {med.distributor}
                                    </span>
                                    <span> ({med.mapped ? 'Mapped' : 'Non-mapped'})</span>
                                  </>
                                ) : (
                                  'No Distributor'
                                )}
                                {med.packaging ? ` • ${med.packaging}` : ''}
                              </span>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0 flex flex-col justify-center items-end">
                            {!med.isErrorMessage && (
                              <div className="text-xs font-mono font-bold text-text flex flex-col items-end">
                                {med.rate !== undefined && med.rate !== null ? (
                                  <span className="text-emerald-400">PTR: ₹{med.rate}</span>
                                ) : null}
                                {med.mrp !== undefined && med.mrp !== null ? (
                                  <span className="text-muted text-[10px]">MRP: ₹{med.mrp}</span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>,
                    document.body
                  )}
                </div>

                {/* Selected Pharmarack preview */}
                {selectedDistributor && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-text flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="truncate pr-2">
                      <div className="font-bold text-emerald-400 text-[9px] uppercase tracking-wider mb-1">Pharmarack Distributor Link</div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-text font-semibold truncate text-xs">{selectedDistributor}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          selectedMapped 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {selectedMapped ? 'Mapped' : 'Non-mapped'}
                        </span>
                        {selectedScheme && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase">
                            {selectedScheme}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="font-mono font-bold whitespace-nowrap flex flex-col items-end gap-0.5 text-right shrink-0">
                        {selectedRate !== '' && <span className="text-emerald-400 text-sm">PTR: ₹{selectedRate}</span>}
                        {selectedMrp !== '' && <span className="text-muted text-[10px]">MRP: ₹{selectedMrp}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDistributor('');
                          setSelectedRate('');
                          setSelectedMrp('');
                          setSelectedMapped(null);
                          setSelectedScheme('');
                          setSelectedProductId('');
                          setSelectedStoreId('');
                          setSelectedProductCode('');
                          setSelectedCompany('');
                          setSelectedPackaging('');
                          setProduct('');
                          setSelectedMedicineName('');
                          setTimeout(() => productInputRef.current?.focus(), 50);
                        }}
                        className="p-1.5 text-muted hover:text-red hover:bg-red-500/10 rounded-xl transition-all ml-2"
                        title="Cancel distributor selection"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Cheaper distributor suggestion banner */}
                {cheaperDistributor && (
                  <button
                    type="button"
                    onClick={handleSwitchToCheaper}
                    className="w-full text-left p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-text flex items-center justify-between shadow-sm hover:bg-amber-500/15 transition-all select-none animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    <div className="pr-2.5 min-w-0 flex-1">
                      <div className="font-bold text-amber-400 flex items-center gap-1 uppercase tracking-wider text-[10px] mb-1">
                        <Sparkles size={12} />
                        <span>Cheaper Distributor Offer Available!</span>
                      </div>
                      <div className="text-text/90 leading-relaxed text-[11px]">
                        <span className="font-bold">{cheaperDistributor.distributor}</span> has this for an effective PTR of <span className="font-black text-emerald-400">₹{cheaperDistributor.effectiveRate.toFixed(2)}</span>
                        {cheaperDistributor.scheme && ` (${cheaperDistributor.scheme} scheme)`}.
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-2 py-1 rounded-lg shrink-0 uppercase tracking-wider">
                      Switch
                    </div>
                  </button>
                )}

                {/* Quantity Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">Quantity</label>
                  <div className="flex items-center justify-between bg-bg3 border border-border rounded-xl h-9 px-1.5 max-w-[150px]">
                    <button
                      type="button"
                      onClick={() => setQty(prev => Math.max(1, (Number(prev) || 1) - 1))}
                      className="w-7.5 h-7.5 rounded-lg hover:bg-bg2 active:scale-90 text-muted hover:text-text transition-all flex items-center justify-center"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      ref={qtyInputRef}
                      type="number"
                      value={qty}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setQty('');
                        } else {
                          const parsed = parseInt(val);
                          setQty(isNaN(parsed) ? '' : parsed);
                        }
                      }}
                      onBlur={() => {
                        if (qty === '' || qty < 1) {
                          setQty(1);
                        }
                      }}
                      className="w-full bg-transparent text-center text-sm font-bold outline-none text-text focus:ring-0 border-0 p-0"
                      min="1"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setQty(prev => (Number(prev) || 1) + 1)}
                      className="w-7.5 h-7.5 rounded-lg hover:bg-bg2 active:scale-90 text-muted hover:text-text transition-all flex items-center justify-center"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Action Row */}
            <div className="pt-4 border-t border-glass-border flex justify-end gap-3 mt-4 flex-row flex-nowrap shrink-0 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-bg3 border border-border text-muted hover:text-text text-xs font-bold rounded-xl transition-all shrink-0 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="live-cart-add-form"
                disabled={isSubmitting || !selectedProductId}
                className="px-5 py-2 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.2)] flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Adding...
                  </>
                ) : (
                  <>
                    <ShoppingCart size={14} /> Add to Cart Live
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Mini Cart Preview */}
          {/* ponytail: show simple mini-cart preview side-by-side */}
          <div className="md:pl-6 pt-4 md:pt-0 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-glass-border/30 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} className="text-emerald-400" />
                <h4 className="text-xs font-bold text-text uppercase tracking-wider">Cart Preview</h4>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-3 scrollbar-thin">
              {cartLoading && cartDistributors.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
                  <Loader2 size={24} className="animate-spin text-emerald-400" />
                  <span className="text-xs text-muted font-mono">Loading cart...</span>
                </div>
              ) : cartError ? (
                <div className="text-center py-4 text-xs text-red/80 bg-red-500/5 rounded-xl border border-red-500/10 p-3">
                  <p className="font-semibold">Failed to load cart</p>
                  <p className="text-[10px] opacity-70 mt-1">{cartError}</p>
                </div>
              ) : cartDistributors.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted">
                  <ShoppingCart size={28} className="opacity-20 mb-2" />
                  <p className="text-xs font-bold">Cart is empty</p>
                  <p className="text-[11px] max-w-[180px] mx-auto mt-0.5">Add items using the search form on the left.</p>
                </div>
              ) : (
                cartDistributors.map((dist) => (
                  <div key={dist.storeId} className="bg-bg3/30 border border-glass-border/30 rounded-xl overflow-hidden p-2.5 space-y-2 hover:border-glass-border/60 transition-all">
                    {/* Distributor Header */}
                    <div className="flex items-center justify-between border-b border-glass-border/20 pb-1.5">
                      <span className="text-[11px] font-bold text-sky uppercase tracking-wide truncate max-w-[160px]" title={dist.storeName}>
                        {dist.storeName}
                      </span>
                      <span className="text-[9px] font-bold text-muted bg-bg3/50 px-1.5 py-0.5 rounded-full border border-glass-border/20">
                        {dist.items.length} item{dist.items.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Distributor Items */}
                    <div className="space-y-1.5">
                      {dist.items.map((item, idx) => (
                        <div key={`${item.productCode}-${idx}`} className="flex justify-between items-start text-[11px] gap-2.5 hover:bg-bg3/40 p-1 rounded transition-colors">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-text block truncate" title={item.productName}>
                              {item.productName}
                            </span>
                            <span className="text-[9px] text-muted flex items-center gap-1 mt-0.5">
                              {item.packaging && <span className="font-mono">{item.packaging}</span>}
                              {item.scheme && (
                                <span className="text-emerald-400 font-bold uppercase text-[8px] bg-emerald-500/10 px-1 rounded">
                                  {item.scheme}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end">
                            <span className="font-bold text-text">Qty: {item.qty}</span>
                            {item.ptr > 0 && <span className="text-[9px] text-muted font-mono mt-0.5">₹{(item.ptr * item.qty).toFixed(2)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Subtotal */}
                    {dist.lineTotal > 0 && (
                      <div className="flex justify-between items-center pt-1.5 border-t border-glass-border/15 text-[11px]">
                        <span className="text-muted uppercase tracking-wider font-bold">Subtotal</span>
                        <span className="font-bold text-emerald-400 font-mono">₹{dist.lineTotal.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Cart Preview Footer Summary */}
            {cartDistributors.length > 0 && (
              <div className="mt-auto pt-3 border-t border-glass-border/30 bg-bg2/40 rounded-xl p-2.5 space-y-1.5 shrink-0">
                <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                  <div>
                    <span className="text-muted block uppercase text-[8px] tracking-wider mb-0.5">Items</span>
                    <span className="font-bold text-text font-mono">{totalProducts}</span>
                  </div>
                  <div>
                    <span className="text-muted block uppercase text-[8px] tracking-wider mb-0.5">Total Qty</span>
                    <span className="font-bold text-text font-mono">{totalQty}</span>
                  </div>
                  <div>
                    <span className="text-muted block uppercase text-[8px] tracking-wider mb-0.5">Est. Total</span>
                    <span className="font-bold text-emerald-400 font-mono text-xs">₹{totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer info hints */}
        <div className="mt-4 pt-3 border-t border-glass-border flex justify-between text-[9px] text-muted/60 font-semibold font-mono">
          <span>[Esc] Close</span>
          <span>[Alt + L] Toggle modal</span>
          <span>[Enter] Add to Cart</span>
        </div>
      </div>


    </div>,
    document.body
  );
};
