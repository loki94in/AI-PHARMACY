import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Minus, Sparkles, Loader2, ShoppingCart } from 'lucide-react';
import { api } from '../services/api';
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

export const LiveCartAddModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Input fields
  const [product, setProduct] = useState('');
  const [qty, setQty] = useState(1);
  
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

  // Suggestions Search
  const [suggestions, setSuggestions] = useState<SuggestionMedicine[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prMode, setPrMode] = useState<'Live' | 'Unknown'>('Unknown');

  const autocompleteRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const ignoreNextSearchRef = useRef(false);

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

  // Open modal on global event trigger
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setTimeout(() => {
        productInputRef.current?.focus();
      }, 100);
    };
    return liveCartAddEvent.subscribeOpen(handleOpen);
  }, []);

  // Keyboard Navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle shortcut: Alt+L (or Ctrl+Shift+L)
      const isToggleKey = 
        (e.altKey && (e.key === 'l' || e.key === 'L')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'l' || e.key === 'L'));

      if (isToggleKey) {
        e.preventDefault();
        setIsOpen(prev => {
          const next = !prev;
          if (next) {
            setTimeout(() => productInputRef.current?.focus(), 100);
          }
          return next;
        });
      }

      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Handle clicking outside to dismiss search results
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
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
        const prData = await api.searchPharmarack(product).catch((err: any) => {
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
          prData.forEach((item: any) => {
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

    if (qty < 1) {
      toastEvent.trigger('Quantity must be at least 1.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.addPharmarackCart([{
        productId: selectedProductId,
        storeId: selectedStoreId,
        qty,
        rate: selectedRate !== '' ? Number(selectedRate) : undefined,
        scheme: selectedScheme || undefined,
        productCode: selectedProductCode,
        company: selectedCompany,
        productName: product.trim(),
        storeName: selectedDistributor,
        packaging: selectedPackaging
      }]);

      toastEvent.trigger(`Added "${product}" directly to live Pharmarack cart!`, 'success');
      
      // Reset form and close
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
      setIsOpen(false);
      
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

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-global-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
      <div className="glass-panel max-w-lg w-full p-6 relative border border-glass-border shadow-[0_0_50px_rgba(59,130,246,0.2)] bg-bg2 text-text animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button 
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-muted hover:text-text rounded-lg hover:bg-bg3 transition-all"
          title="Close Modal (Esc)"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-primary/10 rounded-lg text-primary border border-primary/20">
            <ShoppingCart size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text flex items-center gap-2">
              Add to Live Cart
              <span className="text-[10px] bg-bg3 border border-border text-muted px-2 py-0.5 rounded font-mono">Alt + L</span>
              {prMode !== 'Unknown' && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border leading-none bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  ● LIVE
                </span>
              )}
            </h3>
            <p className="text-xs text-muted">Direct live stock addition for inventory replenishment</p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Autocomplete Search Input */}
          <div className="relative animate-in fade-in duration-200" ref={autocompleteRef}>
            <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Medicine Search</label>
            <div className="relative">
              <span className="absolute left-3.5 top-[13px] text-muted">
                {searchLoading ? <Loader2 size={16} className="animate-spin text-primary" /> : <Search size={16} />}
              </span>
              <input
                ref={productInputRef}
                type="text"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                onKeyDown={handleProductKeyDown}
                className="w-full premium-input pl-11 pr-5 py-3 text-sm font-semibold"
                placeholder="Search Pharmarack catalog..."
                autoComplete="off"
              />
            </div>
            
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-[999999] left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-bg2 border border-glass-border backdrop-blur-xl rounded-xl shadow-2xl divide-y divide-border/30 py-2">
                {suggestions.map((med, index) => (
                  <li
                    key={index}
                    onClick={() => selectSuggestion(med)}
                    className={`px-5 py-3 text-sm cursor-pointer flex justify-between items-center transition-all ${
                      med.isErrorMessage
                        ? 'bg-red-500/10 text-red border-l-2 border-red cursor-default'
                        : index === activeSuggestionIndex 
                        ? 'bg-primary/20 text-text font-medium border-l-2 border-primary' 
                        : 'text-muted hover:text-text hover:bg-bg3'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-text truncate text-sm">{med.medicine_name}</span>
                        {med.stock !== undefined && !med.isErrorMessage && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${getStockStyle(med.stock)}`}>
                            {med.stock} Stock
                          </span>
                        )}
                        {med.scheme && !med.isErrorMessage && (
                          <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                            {med.scheme}
                          </span>
                        )}
                      </div>
                      {!med.isErrorMessage && (
                        <span className="text-xs text-muted block truncate mt-1">
                          {med.distributor ? (
                            <>
                              <span className={med.mapped ? 'text-text font-semibold' : 'text-purple-400 font-semibold'}>
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
              </ul>
            )}
          </div>

          {/* Selected Pharmarack preview */}
          {selectedDistributor && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-text flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="truncate pr-2">
                <div className="font-bold text-emerald-500 text-[10px] uppercase tracking-wider mb-1">Pharmarack Distributor Link</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-text font-semibold truncate">{selectedDistributor}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                    selectedMapped 
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                      : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  }`}>
                    {selectedMapped ? 'Mapped' : 'Non-mapped'}
                  </span>
                  {selectedScheme && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase">
                      {selectedScheme}
                    </span>
                  )}
                </div>
              </div>
              <div className="font-mono font-extrabold whitespace-nowrap flex flex-col items-end gap-0.5 text-right shrink-0">
                {selectedRate !== '' && <span className="text-emerald-500 text-sm">PTR: ₹{selectedRate}</span>}
                {selectedMrp !== '' && <span className="text-muted text-[10px]">MRP: ₹{selectedMrp}</span>}
              </div>
            </div>
          )}

          {/* Quantity Selector */}
          <div>
            <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Quantity</label>
            <div className="flex items-center justify-between bg-bg3 border border-border rounded-2xl h-11 px-1.5 max-w-[200px]">
              <button
                type="button"
                onClick={() => setQty(prev => Math.max(1, prev - 1))}
                className="w-8 h-8 rounded-xl hover:bg-bg2 active:scale-90 text-muted hover:text-text transition-all flex items-center justify-center"
              >
                <Minus size={14} />
              </button>
              <input
                ref={qtyInputRef}
                type="number"
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-transparent text-center text-sm font-bold outline-none text-text focus:ring-0 border-0 p-0"
                min="1"
                required
              />
              <button
                type="button"
                onClick={() => setQty(prev => prev + 1)}
                className="w-8 h-8 rounded-xl hover:bg-bg2 active:scale-90 text-muted hover:text-text transition-all flex items-center justify-center"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-glass-border flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-5 py-2.5 bg-bg3 border border-border text-muted hover:text-text text-xs font-bold rounded-2xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedProductId}
              className="px-6 py-2.5 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-2xl shadow-[0_0_15px_rgba(59,130,246,0.2)] flex items-center gap-1.5"
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
        </form>

        {/* Footer info hints */}
        <div className="mt-4 pt-3 border-t border-glass-border flex justify-between text-[9px] text-muted/60 font-medium font-mono">
          <span>[Esc] Close</span>
          <span>[Alt + L] Toggle modal</span>
          <span>[Enter] Add to Cart</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
