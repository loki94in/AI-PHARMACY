import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Plus, Minus, Send, ClipboardList, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { toastEvent, quickOrderEvent } from '../services/events';

interface SuggestionMedicine {
  inventory_id?: number;
  medicine_id?: number;
  medicine_name: string;
  batch_no?: string;
  quantity?: number;
  mrp?: number;
}

export const QuickOrderModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Form State
  const [product, setProduct] = useState('');
  const [requester, setRequester] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High'>('Normal');
  
  // Search state
  const [suggestions, setSuggestions] = useState<SuggestionMedicine[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const autocompleteRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  // Toggle modal on custom event
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      // Autofocus medicine name input on open
      setTimeout(() => {
        productInputRef.current?.focus();
      }, 100);
    };
    return quickOrderEvent.subscribeOpen(handleOpen);
  }, []);

  // Listen to keyboard shortcuts globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle shortcuts: Alt+O or Alt+N (or Ctrl+Shift+O)
      const isToggleKey = 
        (e.altKey && (e.key === 'o' || e.key === 'O')) ||
        (e.altKey && (e.key === 'n' || e.key === 'N')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'o' || e.key === 'O'));

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

      // Close on Escape when open
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Handle outside clicks for autocomplete
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Medicine autocomplete search
  useEffect(() => {
    if (product.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const delayDebounce = setTimeout(() => {
      setSearchLoading(true);
      api.searchMedicine(product)
        .then(data => {
          if (Array.isArray(data)) {
            // Map keys just in case structure differs
            const list: SuggestionMedicine[] = data.map((item: any) => ({
              inventory_id: item.inventory_id,
              medicine_id: item.medicine_id,
              medicine_name: item.medicine_name || item.name,
              batch_no: item.batch_no,
              quantity: item.quantity,
              mrp: item.mrp
            }));
            setSuggestions(list);
            setShowSuggestions(list.length > 0);
            setActiveSuggestionIndex(-1);
          }
        })
        .catch(err => console.error('Error searching medicines for quick order:', err))
        .finally(() => setSearchLoading(false));
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [product]);

  // Autocomplete key navigation
  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggestionIndex]);
      }
    }
  };

  const selectSuggestion = (med: SuggestionMedicine) => {
    setProduct(med.medicine_name);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
  };

  // Submit Order Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product.trim()) {
      toastEvent.trigger('Medicine/Product name is required.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createOrder({
        product: product.trim(),
        requester: requester.trim() || 'Anonymous',
        phone: phone.replace(/\D/g, '') || '',
        qty,
        priority,
        status: 'Pending'
      });

      toastEvent.trigger(`Special order for "${product}" created successfully!`, 'success');
      
      // Reset state
      setProduct('');
      setRequester('');
      setPhone('');
      setQty(1);
      setPriority('Normal');
      setIsOpen(false);
      
      // Force trigger refresh on active page if needed (via event or page transition)
      window.dispatchEvent(new CustomEvent('refresh-special-orders'));
    } catch (err) {
      console.error('Error in Quick Order submit:', err);
      toastEvent.trigger('Failed to create special order request.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
      <div className="glass-panel max-w-md w-full p-6 relative border border-glass-border shadow-[0_0_50px_rgba(59,130,246,0.2)] bg-zinc-900/90 text-text animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button 
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-muted hover:text-white rounded-lg hover:bg-white/5 transition-all"
          title="Close Modal (Esc)"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg text-primary border border-primary/20">
            <ClipboardList size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Quick Special Request
              <span className="text-[10px] bg-white/5 border border-glass-border text-muted px-2 py-0.5 rounded font-mono">Alt + O</span>
            </h3>
            <p className="text-xs text-muted">Instantly log out-of-stock demands from any screen</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Product / Medicine Autocomplete */}
          <div className="relative" ref={autocompleteRef}>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Medicine Name</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted">
                {searchLoading ? <Loader2 size={16} className="animate-spin text-primary" /> : <Search size={16} />}
              </span>
              <input
                ref={productInputRef}
                type="text"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                onKeyDown={handleProductKeyDown}
                className="w-full premium-input pl-10 pr-4 py-2"
                placeholder="Search or enter medicine name..."
                required
                autoComplete="off"
              />
            </div>
            
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-zinc-950/95 border border-glass-border backdrop-blur-xl rounded-xl shadow-2xl divide-y divide-glass-border py-1">
                {suggestions.map((med, index) => (
                  <li
                    key={index}
                    onClick={() => selectSuggestion(med)}
                    className={`px-4 py-2.5 text-sm cursor-pointer flex justify-between items-center transition-all ${
                      index === activeSuggestionIndex 
                        ? 'bg-primary/20 text-white font-medium border-l-2 border-primary' 
                        : 'text-muted hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div>
                      <span className="font-medium text-text">{med.medicine_name}</span>
                      {med.batch_no && <span className="text-[10px] text-muted/60 block">Batch: {med.batch_no}</span>}
                    </div>
                    <div className="text-right">
                      {med.quantity !== undefined && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          med.quantity <= 0 ? 'bg-red-500/10 text-red border border-red-500/20' : 'bg-green-500/10 text-green border border-green-500/20'
                        }`}>
                          {med.quantity} in stock
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Customer / Requester Name */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Customer Name</label>
            <input
              type="text"
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
              className="w-full premium-input py-2"
              placeholder="e.g. John Doe (Optional)"
              autoComplete="off"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full premium-input py-2"
              placeholder="e.g. 9876543210 (Optional)"
              maxLength={15}
              autoComplete="off"
            />
            {phone.replace(/\D/g, '').length === 10 && (
              <span className="text-[10px] text-green/80 flex items-center gap-1 mt-1 font-medium">
                <Sparkles size={10} /> Automated WhatsApp booking confirmation will be dispatched
              </span>
            )}
          </div>

          {/* Quantity & Priority Selector */}
          <div className="grid grid-cols-2 gap-4">
            
            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Quantity</label>
              <div className="flex items-center bg-black/20 border border-border rounded-lg h-9 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQty(prev => Math.max(1, prev - 1))}
                  className="px-3 h-full hover:bg-white/5 active:bg-white/10 text-muted hover:text-white border-r border-border transition-all flex items-center justify-center"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-transparent text-center text-sm font-semibold outline-none text-text"
                  min="1"
                  required
                />
                <button
                  type="button"
                  onClick={() => setQty(prev => prev + 1)}
                  className="px-3 h-full hover:bg-white/5 active:bg-white/10 text-muted hover:text-white border-l border-border transition-all flex items-center justify-center"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Priority</label>
              <div className="flex bg-black/20 border border-border rounded-lg p-0.5 h-9">
                {(['Low', 'Normal', 'High'] as const).map((p) => {
                  const active = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`flex-1 text-xs font-semibold rounded-md transition-all ${
                        active 
                          ? p === 'High' 
                            ? 'bg-red text-white shadow-[0_0_8px_rgba(239,68,68,0.3)]' 
                            : p === 'Low'
                            ? 'bg-zinc-700 text-zinc-300'
                            : 'bg-primary text-white shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                          : 'text-muted hover:text-text'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex-1 bg-white/5 hover:bg-white/10 border border-glass-border premium-btn text-muted hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !product.trim()}
              className="flex-1 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed premium-btn text-white shadow-[0_0_15px_rgba(59,130,246,0.2)]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Logging...
                </>
              ) : (
                <>
                  <Send size={16} /> Log Request
                </>
              )}
            </button>
          </div>
          
        </form>

        {/* Footer info hints */}
        <div className="mt-4 pt-3 border-t border-glass-border flex justify-between text-[10px] text-muted/60 font-medium font-mono">
          <span>[Esc] Close</span>
          <span>[Alt + O] Toggle modal</span>
          <span>[Enter] Submit</span>
        </div>
      </div>
    </div>
  );
};
