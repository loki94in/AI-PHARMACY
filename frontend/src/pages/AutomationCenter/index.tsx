// @ts-nocheck
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  Plus, 
  Trash2, 
  Send, 
  Play, 
  Pause, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  RefreshCw,
  Clock, 
  Sliders,
  ExternalLink,
  MessageSquare,
  Users,
  Mail,
  Settings,
  Copy,
  Receipt,
  Phone,
  Package,
  CheckCheck,
} from 'lucide-react';
import { api, apiClient } from '../../services/api';
import type { Refill, AutomationNotification } from '../../services/api';
import { toastEvent } from '../../services/events';
import { useDeferredEffect } from '../../hooks/useDeferredEffect';

// Module-level cache to persist data across page navigation (unmount/remount)
let cachedRefills: Refill[] = [];
let cachedLogs: AutomationNotification[] = [];

function composeRefillMessage(refill: any): string {
  const medNames = (refill.items || [])
    .map((it: any) => it.medicine_name || it.name || '')
    .filter(Boolean)
    .join(', ') || refill.medicine_name || 'your prescription';
  return `Hello ${refill.patient_name}, your prescription refill for ${medNames} is now ready and in stock! Please visit the pharmacy to collect it.`;
}

function openWhatsAppManual(phone: string, message: string) {
  const cleaned = phone.replace(/\D/g, '');
  const number = cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank');
}

function getStockStatus(refill: any): { label: string; cls: string } {
  if (refill.is_ready === 1)
    return { label: 'Ready', cls: 'bg-green/15 text-green border-green/25' };
  if (refill.hold_for_stock === 1)
    return { label: 'Waiting Stock', cls: 'bg-amber/15 text-amber border-amber/25' };
  const due = refill.next_refill_date ? new Date(refill.next_refill_date) : null;
  if (due) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { label: 'Overdue', cls: 'bg-red/15 text-red border-red/25' };
    if (diff <= 3) return { label: 'Due Soon', cls: 'bg-sky/15 text-sky border-sky/25' };
  }
  return { label: 'Scheduled', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25' };
}

const AutomationCenter = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'reminders' | 'logs'>('reminders');

  // Reminders States
  const [refills, setRefills] = useState<Refill[]>(() => cachedRefills);
  const [loadingRefills, setLoadingRefills] = useState(() => cachedRefills.length === 0);
  const [refillSearch, setRefillSearch] = useState('');

  // Create / Edit Reminder Modal States
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingRefillId, setEditingRefillId] = useState<number | null>(null);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [refillInterval, setRefillInterval] = useState<number>(30);
  const [medicineQuery, setMedicineQuery] = useState('');
  const [selectedMedicines, setSelectedMedicines] = useState<Array<{ id: number; name: string }>>([]);
  const [medicineSearchResults, setMedicineSearchResults] = useState<any[]>([]);
  const [showMedicineDropdown, setShowMedicineDropdown] = useState(false);
  const [loadingMedicineSearch, setLoadingMedicineSearch] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Communication Logs States
  const [logs, setLogs] = useState<AutomationNotification[]>(() => cachedLogs);
  const [loadingLogs, setLoadingLogs] = useState(() => cachedLogs.length === 0);
  const [logsSearch, setLogsSearch] = useState('');
  const [logsStatusFilter, setLogsStatusFilter] = useState('All');
  const [logsTypeFilter, setLogsTypeFilter] = useState('All');

  // Manual Send Details Dialog State
  const [manualSendNotification, setManualSendNotification] = useState<AutomationNotification | null>(null);

  // Stock check & manual message preview
  const [expandedMessageId, setExpandedMessageId] = useState<number | null>(null);
  const [checkingStock, setCheckingStock] = useState(false);
  const [stockFilter, setStockFilter] = useState<'all' | 'ready' | 'waiting' | 'overdue'>('all');
  const [sendingId, setSendingId] = useState<number | null>(null);

  const filteredRefills = useMemo(() => {
    const term = refillSearch.toLowerCase();
    let result = term
      ? refills.filter(r =>
          r.patient_name.toLowerCase().includes(term) ||
          r.patient_phone.includes(term) ||
          (r.items && r.items.some(it => (it.medicine_name || it.name || '').toLowerCase().includes(term))) ||
          (r.medicine_name && r.medicine_name.toLowerCase().includes(term))
        )
      : refills;
    if (stockFilter === 'ready') result = result.filter(r => r.is_ready === 1);
    if (stockFilter === 'waiting') result = result.filter(r => r.hold_for_stock === 1);
    if (stockFilter === 'overdue') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      result = result.filter(r => r.next_refill_date && new Date(r.next_refill_date) < today && r.is_ready !== 1);
    }
    return result;
  }, [refills, refillSearch, stockFilter]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    toastEvent.trigger(message, type === 'success' ? 'automation' : type, '/automation-center');
  }, []);

  const fetchRefills = useCallback(async () => {
    if (cachedRefills.length === 0) setLoadingRefills(true);
    try {
      const data = await api.getRefills();
      const list = Array.isArray(data) ? data.slice(0, 100) : [];
      setRefills(list);
      cachedRefills = list;
    } catch (err) {
      console.error('Failed to fetch refills:', err);
      showToast('Failed to load refills. Please try again.', 'error');
    } finally {
      setLoadingRefills(false);
    }
  }, [showToast]);

  const fetchLogs = useCallback(async (searchOverride?: string) => {
    if (cachedLogs.length === 0) setLoadingLogs(true);
    try {
      const type = logsTypeFilter === 'All' ? undefined : logsTypeFilter;
      const status = logsStatusFilter === 'All' ? undefined : logsStatusFilter;
      const search = searchOverride !== undefined ? searchOverride.trim() : logsSearch.trim();
      const data = await api.getAutomationNotifications({ type, status, search: search || undefined, limit: 100 });
      const list = Array.isArray(data) ? data : [];
      setLogs(list);
      cachedLogs = list;
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      showToast('Failed to load communication logs.', 'error');
    } finally {
      setLoadingLogs(false);
    }
  }, [logsTypeFilter, logsStatusFilter, logsSearch, showToast]);

  useDeferredEffect(() => {
    if (activeTab === 'reminders') {
      fetchRefills();
    }
  }, [activeTab, fetchRefills]);

  // ponytail: merged two duplicate useDeferredEffect hooks into one.
  // Both called fetchLogs() when activeTab === 'logs', causing double requests.
  useDeferredEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [logsTypeFilter, logsStatusFilter, activeTab, fetchLogs]);

  const medicineSearchTimeout = useRef<number | null>(null);
  useEffect(() => {
    if (!medicineQuery.trim() || medicineQuery.trim().length < 2) {
      setMedicineSearchResults([]);
      setShowMedicineDropdown(false);
      setLoadingMedicineSearch(false);
      return;
    }

    if (medicineSearchTimeout.current) {
      window.clearTimeout(medicineSearchTimeout.current);
    }

    setLoadingMedicineSearch(true);
    medicineSearchTimeout.current = window.setTimeout(async () => {
      try {
        // Search from medicines table directly instead of heavy inventory master (AC3)
        const searchData = await api.searchMedicine(medicineQuery.trim());
        const medsList = Array.isArray(searchData) ? searchData : [];
        const uniqueMeds = medsList
          .map((item: any, idx: number) => {
            const name = item.name || item.medicine_name || '';
            const id = item.id || item.medicine_id || idx;
            return { id, name };
          })
          .filter((item) => item.name && !selectedMedicines.find(m => m.name === item.name))
          .slice(0, 15); // limit display to 15 items
        
        setMedicineSearchResults(uniqueMeds);
        setShowMedicineDropdown(uniqueMeds.length > 0);
      } catch (err) {
        console.error('Medicine query failed:', err);
        setMedicineSearchResults([]);
      } finally {
        setLoadingMedicineSearch(false);
      }
    }, 300);

    return () => {
      if (medicineSearchTimeout.current) window.clearTimeout(medicineSearchTimeout.current);
    };
  }, [medicineQuery, selectedMedicines]);

  const handleSelectMedicine = useCallback((med: any) => {
    // Add to selected medicines array (multi-select)
    setSelectedMedicines(prev => {
      if (!prev.find(m => m.id === med.id)) {
        return [...prev, { id: med.id, name: med.name }];
      }
      return prev;
    });
    setMedicineQuery(''); // Clear input after selection
    setShowMedicineDropdown(false);
  }, []);

  const handleRemoveMedicine = useCallback((medId: number) => {
    setSelectedMedicines(prev => prev.filter(m => m.id !== medId));
  }, []);

  const handleSaveReminder = useCallback(async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    if (!patientName.trim()) return showToast('Patient name is required.', 'error');
    if (!patientPhone.trim()) return showToast('Phone number is required.', 'error');
    if (patientPhone.replace(/\D/g, '').length < 10) return showToast('Please enter a valid 10-digit phone number.', 'error');
    if (selectedMedicines.length === 0) return showToast('Please select at least one medicine from inventory.', 'error');
    if (refillInterval < 0 || refillInterval > 180) return showToast('Refill interval must be 0 to 180 days.', 'error');

    setModalSubmitting(true);
    const cleanPhone = patientPhone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const items = selectedMedicines.map(med => ({
      medicine_id: med.id,
      qty: med.qty || 10
    }));

    try {
      if (editingRefillId) {
        await api.updateRefill(editingRefillId, {
          patient_name: patientName.trim(),
          patient_phone: formattedPhone,
          refill_interval_days: refillInterval,
          items
        });
        showToast('Prescription refill reminder updated.', 'success');
      } else {
        await api.createRefill({
          patient_name: patientName.trim(),
          patient_phone: formattedPhone,
          refill_interval_days: refillInterval,
          items
        });
        showToast('Refill reminder profile created successfully.', 'success');
      }

      setShowReminderModal(false);
      setEditingRefillId(null);
      setPatientName('');
      setPatientPhone('');
      setRefillInterval(30);
      setMedicineQuery('');
      setSelectedMedicines([]);
      fetchRefills();
    } catch (err) {
      console.error('Error saving reminder:', err);
      showToast('Failed to save refill reminder.', 'error');
    } finally {
      setModalSubmitting(false);
    }
  }, [editingRefillId, patientName, patientPhone, refillInterval, selectedMedicines, fetchRefills, showToast]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleSaveReminder();
      return;
    }
    if (e.key === 'Escape') {
      setShowReminderModal(false);
      setEditingRefillId(null);
      setPatientName('');
      setPatientPhone('');
      setRefillInterval(30);
      setMedicineQuery('');
      setSelectedMedicines([]);
      setManualSendNotification(null);
    }
  }, [handleSaveReminder]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleEditReminderClick = useCallback((refill: Refill) => {
    setEditingRefillId(refill.id);
    setPatientName(refill.patient_name);
    setPatientPhone(refill.patient_phone);
    setRefillInterval(refill.refill_interval_days);
    if (refill.items && refill.items.length > 0) {
      setSelectedMedicines(refill.items.map(it => ({
        id: it.medicine_id,
        name: it.medicine_name || it.name || `Medicine ${it.medicine_id}`,
        qty: it.qty || 10
      })));
    } else {
      setSelectedMedicines([{
        id: refill.medicine_id,
        name: refill.medicine_name || `Medicine ${refill.medicine_id}`,
        qty: refill.last_qty_dispensed || 10
      }]);
    }
    setMedicineQuery('');
    setShowReminderModal(true);
  }, []);

  const handleToggleActive = useCallback(async (refill: Refill) => {
    const nextActive = refill.is_active === 1 ? 0 : 1;
    try {
      setRefills(prev => prev.map(r => (r.id === refill.id ? { ...r, is_active: nextActive } : r)));
      await api.updateRefill(refill.id, { is_active: nextActive });
      showToast(`Refill schedule is now ${nextActive === 1 ? 'Active' : 'Paused'}.`, 'success');
    } catch (err) {
      console.error('Failed to toggle active status:', err);
      showToast('Failed to change status. Reverting.', 'error');
      fetchRefills();
    }
  }, [fetchRefills, showToast]);

  const handleSendNow = useCallback(async (id: number) => {
    setSendingId(id);
    try {
      showToast('Sending message to patient...', 'info');
      await api.sendRefillNow(id);
      showToast('Refill reminder sent via WhatsApp!', 'success');
      setExpandedMessageId(null);
      fetchRefills();
      if (activeTab === 'logs') fetchLogs();
    } catch (err: any) {
      console.error('Failed to trigger send:', err);
      showToast('Auto-send failed — use the manual options below to reach the patient.', 'error');
      setExpandedMessageId(id); // auto-expand fallback panel
      fetchRefills();
      if (activeTab === 'logs') fetchLogs();
    } finally {
      setSendingId(null);
    }
  }, [activeTab, fetchRefills, fetchLogs, showToast]);

  const handleSaveIntervalInline = useCallback(async (id: number, interval: number) => {
    if (interval < 0 || interval > 180) return showToast('Interval must be 0 to 180 days.', 'error');
    try {
      await api.updateRefill(id, { refill_interval_days: interval });
      showToast('Refill interval updated.', 'success');
      fetchRefills();
    } catch (err) {
      console.error('Failed to update interval inline:', err);
      showToast('Failed to update interval.', 'error');
    }
  }, [fetchRefills, showToast]);

  const handleDeleteReminder = useCallback(async (id: number) => {
    if (!confirm('Are you sure you want to cancel this refill schedule?')) return;
    try {
      setRefills(prev => prev.filter(r => r.id !== id));
      await api.deleteRefill(id);
      showToast('Refill schedule deleted successfully.', 'success');
    } catch (err) {
      console.error('Failed to delete refill:', err);
      showToast('Failed to delete refill schedule.', 'error');
      fetchRefills();
    }
  }, [fetchRefills, showToast]);

  const handleRetryDispatch = useCallback(async (id: number) => {
    try {
      showToast('Retrying message dispatch...', 'info');
      await api.retryNotification(id);
      showToast('Message resent successfully!', 'success');
      fetchLogs();
    } catch (err: any) {
      console.error('Failed to retry:', err);
      showToast('Resend failed: ' + (err.response?.data?.error || err.message), 'error');
      fetchLogs();
    }
  }, [fetchLogs, showToast]);

  const handleCancelDispatch = useCallback(async (id: number) => {
    try {
      showToast('Cancelling notification...', 'info');
      await api.cancelNotification(id);
      showToast('Notification successfully cancelled.', 'success');
      fetchLogs();
    } catch (err: any) {
      console.error('Failed to cancel:', err);
      showToast('Cancel failed: ' + (err.response?.data?.error || err.message), 'error');
      fetchLogs();
    }
  }, [fetchLogs, showToast]);

  const handleMarkSentManually = useCallback(async (notification: AutomationNotification) => {
    try {
      await api.manualNotification(notification.id);
      showToast('Message marked as sent manually.', 'success');
      setManualSendNotification(null);
      fetchLogs();

      const phone = notification.recipient_phone;
      const text = encodeURIComponent(notification.message);
      const url = `https://wa.me/${phone}?text=${text}`;
      window.open(url, '_blank');
    } catch (err) {
      console.error('Failed to mark sent manually:', err);
      showToast('Failed to update message status.', 'error');
    }
  }, [fetchLogs, showToast]);

  const handleCopyMessage = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success');
  }, [showToast]);

  const handleCheckStock = useCallback(async () => {
    setCheckingStock(true);
    try {
      await apiClient.post('/refills/check');
      await fetchRefills();
      showToast('Stock check complete! Patient statuses updated.', 'success');
    } catch {
      showToast('Stock check failed.', 'error');
    } finally {
      setCheckingStock(false);
    }
  }, [fetchRefills, showToast]);

  const getLogTypeLabel = useCallback((type: string) => {
    switch (type) {
      case 'refill_reminder':
        return 'Patient Refill';
      case 'distributor_invoice':
        return 'Invoice Summary';
      case 'delivery_boy':
        return 'Delivery Alert';
      case 'quick_order':
        return 'Quick Order Confirm';
      case 'order_ready':
        return 'Order Ready Notification';
      case 'uncollected_reminder':
        return 'Uncollected Reminder';
      default:
        return type;
    }
  }, []);

  const getLogTypeIcon = useCallback((type: string) => {
    switch (type) {
      case 'refill_reminder':
        return <Users size={14} className="text-primary" />;
      case 'distributor_invoice':
        return <Mail size={14} className="text-purple-400" />;
      case 'delivery_boy':
        return <Sliders size={14} className="text-amber-400" />;
      default:
        return <MessageSquare size={14} className="text-sky-400" />;
    }
  }, []);

  return (
    <div className="h-full flex flex-col fade-in gap-3 pb-4 overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 bg-white/[0.02] p-4 rounded-2xl border border-glass-border">
        <div>
          <h2 className="text-lg font-bold bg-gradient-to-r from-text to-sky bg-clip-text text-transparent flex items-center gap-2">
            <Sliders size={20} className="text-sky" />
            Communication & Automation Center
          </h2>
          <p className="text-xs text-muted mt-1">Manage patient refill intervals, monitor message delivery status logs, and configure manual retry controls.</p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('reminders')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all uppercase flex items-center justify-center gap-2 border ${
              activeTab === 'reminders'
                ? 'bg-primary/20 border-primary text-primary shadow-[inset_0_0_15px_rgba(59,130,246,0.15)]'
                : 'bg-white/5 border-glass-border text-muted hover:text-text hover:bg-white/10'
            }`}
          >
            <Clock size={14} />
            Refills & Reminders
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all uppercase flex items-center justify-center gap-2 border ${
              activeTab === 'logs'
                ? 'bg-primary/20 border-primary text-primary shadow-[inset_0_0_15px_rgba(59,130,246,0.15)]'
                : 'bg-white/5 border-glass-border text-muted hover:text-text hover:bg-white/10'
            }`}
          >
            <MessageSquare size={14} />
            Communication Logs
          </button>
        </div>
      </div>

      {activeTab === 'reminders' && (
        <div className="flex-1 flex flex-col min-h-0 glass-panel bg-white/5 border-glass-border">
          <div className="p-4 border-b border-glass-border bg-black/10 shrink-0 space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 text-muted" size={14} />
                <input
                  type="text"
                  value={refillSearch}
                  onChange={e => setRefillSearch(e.target.value)}
                  placeholder="Search patient, phone, medicine..."
                  className="premium-input pl-9 pr-4 py-1.5 text-xs w-full"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={fetchRefills}
                  className="p-2 rounded-xl bg-white/5 border border-glass-border hover:bg-white/10 hover:text-text text-muted transition-all"
                  title="Refresh List"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={handleCheckStock}
                  disabled={checkingStock}
                  className="premium-btn bg-amber/20 border border-amber/40 text-amber hover:bg-amber/30 px-3 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50"
                  title="Run stock check — updates Ready / Waiting status for all patients"
                >
                  {checkingStock ? <RefreshCw size={13} className="animate-spin" /> : <Package size={13} />}
                  Check Stock
                </button>
                <button
                  onClick={() => {
                    setEditingRefillId(null);
                    setPatientName('');
                    setPatientPhone('');
                    setRefillInterval(30);
                    setMedicineQuery('');
                    setSelectedMedicines([]);
                    setShowReminderModal(true);
                  }}
                  className="premium-btn bg-primary text-white shadow-[0_4px_14px_rgba(14,165,233,0.35)] px-4 py-2 text-xs flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  Create Refill reminder
                </button>
              </div>
            </div>

            {/* Stock filter chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider shrink-0">Show:</span>
              {([
                { key: 'all', label: 'All Patients' },
                { key: 'ready', label: '✓ Ready to Notify' },
                { key: 'waiting', label: 'Waiting for Stock' },
                { key: 'overdue', label: 'Overdue' },
              ] as const).map(({ key, label }) => {
                const count = key === 'all' ? refills.length
                  : key === 'ready' ? refills.filter(r => r.is_ready === 1).length
                  : key === 'waiting' ? refills.filter(r => r.hold_for_stock === 1).length
                  : refills.filter(r => { const t = new Date(); t.setHours(0,0,0,0); return r.next_refill_date && new Date(r.next_refill_date) < t && r.is_ready !== 1; }).length;
                return (
                  <button
                    key={key}
                    onClick={() => setStockFilter(key)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                      stockFilter === key
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-white/5 border-glass-border text-muted hover:text-text hover:bg-white/10'
                    }`}
                  >
                    {label} <span className="font-mono opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-black/10">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-bg2/95 backdrop-blur z-10">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border">Patient Info</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border">Medicines</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border text-center">Refill Cycles</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border">Next Due</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border text-center">Stock</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border text-center">Status</th>
                  <th className="p-4 text-xs font-bold text-muted border-b border-glass-border text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingRefills ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-muted">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-sky opacity-60" />
                      Loading patient refills...
                    </td>
                  </tr>
                ) : filteredRefills.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-16 text-center text-muted font-medium">
                      <Clock size={36} className="mx-auto mb-3 text-muted/40 animate-pulse-slow" />
                      No active refill reminder schedules found.
                    </td>
                  </tr>
                ) : (
                  filteredRefills.map(refill => {
                    const stock = getStockStatus(refill);
                    const msg = composeRefillMessage(refill);
                    const isExpanded = expandedMessageId === refill.id;
                    return (
                      <React.Fragment key={refill.id}>
                        <tr className={`border-b border-glass-border/30 transition-all align-top ${isExpanded ? 'bg-white/[0.08]' : 'hover:bg-white/5'}`}>
                          <td className="p-4">
                            <div className="font-bold text-text">{refill.patient_name}</div>
                            <div className="text-[10px] text-muted font-mono mt-0.5">{refill.patient_phone}</div>
                            <div className="text-[10px] text-muted mt-1">{(refill.items || []).length} medicine{(refill.items || []).length !== 1 ? 's' : ''}</div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1.5">
                              {(refill.items || []).map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${refill.is_active === 1 ? 'bg-green' : 'bg-zinc-500'}`} />
                                  <div className="min-w-0">
                                    <span className="font-semibold text-text truncate max-w-[180px] block" title={item.medicine_name || item.name || `Medicine ID: ${item.medicine_id}`}>
                                      {item.medicine_name || item.name || `Medicine ID: ${item.medicine_id}`}
                                    </span>
                                    <span className="text-[10px] text-muted">qty: {item.qty || 10} units</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <input
                              type="number"
                              min="0"
                              max="180"
                              value={refill.refill_interval_days}
                              onChange={e => handleSaveIntervalInline(refill.id, parseInt(e.target.value) || 30)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                              className="w-16 text-center font-mono font-bold bg-black/40 border border-glass-border/60 rounded px-1.5 py-0.5 text-text focus:outline-none focus:border-primary/50"
                            />
                          </td>
                          <td className="p-4 font-mono font-medium text-text select-none">
                            {refill.next_refill_date ? new Date(refill.next_refill_date).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${stock.cls}`}>
                              {stock.label === 'Ready' && <CheckCheck size={9} className="mr-1" />}
                              {stock.label}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleToggleActive(refill)}
                              className={`px-2.5 py-0.5 rounded-xl text-[10px] font-bold border inline-flex items-center justify-center gap-1 transition-all ${
                                refill.is_active === 1
                                  ? 'bg-green/10 border-green/30 text-green hover:bg-green/20'
                                  : 'bg-zinc-500/10 border-glass-border text-muted hover:bg-white/5'
                              }`}
                            >
                              {refill.is_active === 1 ? <Play size={9} /> : <Pause size={9} />}
                              {refill.is_active === 1 ? 'Active' : 'Paused'}
                            </button>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => navigate(`/pos?refillId=${refill.id}`)}
                                className="p-1.5 rounded-lg bg-green/10 border border-green/30 text-green hover:bg-green/20 transition-all"
                                title="Bill Refill"
                              >
                                <Receipt size={12} />
                              </button>
                              <button
                                onClick={() => setExpandedMessageId(isExpanded ? null : refill.id)}
                                className={`p-1.5 rounded-lg border transition-all ${
                                  isExpanded
                                    ? 'bg-primary/20 border-primary text-primary'
                                    : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                                }`}
                                title="Preview message — copy or open in WhatsApp manually"
                              >
                                <MessageSquare size={12} />
                              </button>
                              <button
                                onClick={() => handleSendNow(refill.id)}
                                disabled={refill.is_active !== 1 || sendingId === refill.id}
                                className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky hover:bg-sky-500/20 disabled:opacity-40 transition-all"
                                title="Send via WhatsApp automatically"
                              >
                                {sendingId === refill.id
                                  ? <RefreshCw size={12} className="animate-spin" />
                                  : <Send size={12} />
                                }
                              </button>
                              <button
                                onClick={() => handleEditReminderClick(refill)}
                                className="p-1.5 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 text-muted hover:text-text transition-all"
                                title="Edit reminder"
                              >
                                <Settings size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteReminder(refill.id)}
                                className="p-1.5 rounded-lg bg-red/10 border border-red/20 hover:bg-red/20 text-red transition-all"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-primary/20 bg-primary/5">
                            <td colSpan={7} className="px-5 pb-4 pt-3">
                              <div className="flex flex-col gap-3">
                                {/* Primary: direct send */}
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => handleSendNow(refill.id)}
                                    disabled={refill.is_active !== 1 || sendingId === refill.id}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky/20 border border-sky/40 text-sm font-bold text-sky hover:bg-sky/30 disabled:opacity-40 transition-all shadow-[0_2px_10px_rgba(14,165,233,0.2)]"
                                  >
                                    {sendingId === refill.id
                                      ? <RefreshCw size={13} className="animate-spin" />
                                      : <Send size={13} />
                                    }
                                    {sendingId === refill.id ? 'Sending…' : 'Send via WhatsApp'}
                                  </button>
                                  <span className="text-[10px] text-muted">
                                    Auto-sends to <span className="font-mono text-text/70">{refill.patient_phone}</span>
                                  </span>
                                </div>

                                {/* Divider */}
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-px bg-glass-border/40" />
                                  <span className="text-[10px] text-muted font-bold uppercase tracking-wider">If auto-send fails — share manually</span>
                                  <div className="flex-1 h-px bg-glass-border/40" />
                                </div>

                                {/* Message preview */}
                                <div className="bg-black/30 border border-primary/20 rounded-xl p-3 text-sm text-text/90 leading-relaxed font-medium select-all cursor-text">
                                  {msg}
                                </div>

                                {/* Manual fallback actions */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    onClick={() => { navigator.clipboard.writeText(msg); showToast('Message copied!', 'success'); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700/60 border border-glass-border text-xs font-semibold text-text hover:bg-zinc-700 transition-all"
                                  >
                                    <Copy size={11} /> Copy Text
                                  </button>
                                  <button
                                    onClick={() => openWhatsAppManual(refill.patient_phone, msg)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green/15 border border-green/30 text-xs font-semibold text-green hover:bg-green/25 transition-all"
                                  >
                                    <Phone size={11} /> Open in WhatsApp
                                  </button>
                                  <span className="text-[10px] text-muted">
                                    → <span className="font-mono text-text/60">{refill.patient_phone}</span>
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="flex-1 flex flex-col min-h-0 glass-panel bg-white/5 border-glass-border">
          <div className="p-4 border-b border-glass-border bg-black/15 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 text-muted" size={14} />
              <input
                type="text"
                value={logsSearch}
                onChange={e => setLogsSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchLogs(logsSearch)}
                placeholder="Search patient, distributor, msg..."
                className="premium-input pl-9 pr-4 py-1.5 text-xs w-full"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted font-bold uppercase">Type:</span>
                <select
                  value={logsTypeFilter}
                  onChange={e => setLogsTypeFilter(e.target.value)}
                  className="px-2 py-1 bg-black/40 border border-glass-border text-xs text-text rounded focus:outline-none"
                >
                  <option value="All">All Types</option>
                  <option value="refill_reminder">Patient Refills</option>
                  <option value="distributor_invoice">Invoice summary</option>
                  <option value="delivery_boy">Delivery Alerts</option>
                  <option value="quick_order">Order Confirmations</option>
                  <option value="order_ready">Ready Notifications</option>
                  <option value="uncollected_reminder">Uncollected Reminders</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted font-bold uppercase">Status:</span>
                <select
                  value={logsStatusFilter}
                  onChange={e => setLogsStatusFilter(e.target.value)}
                  className="px-2 py-1 bg-black/40 border border-glass-border text-xs text-text rounded focus:outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="sent">Sent Automatically</option>
                  <option value="failed">Failed / Queued</option>
                  <option value="sent_manually">Sent Manually</option>
                </select>
              </div>

              <button
                onClick={() => fetchLogs(logsSearch)}
                className="p-2 rounded-xl bg-white/5 border border-glass-border hover:bg-white/10 hover:text-text text-muted transition-all"
                title="Refresh Logs"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-black/10">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-bg2/95 backdrop-blur z-10">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border">Message Type</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border">Recipient</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border max-w-sm">Message Snippet</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border">Status</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase border-b border-glass-border">Time Dispatched</th>
                  <th className="p-4 text-xs font-bold text-muted border-b border-glass-border text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingLogs ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-muted">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-sky opacity-60" />
                      Loading message history logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-16 text-center text-muted font-medium">
                      <MessageSquare size={36} className="mx-auto mb-3 text-muted/40 animate-pulse-slow" />
                      No matching communication records found.
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="hover:bg-white/5 border-b border-glass-border/30 transition-all">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {getLogTypeIcon(log.type)}
                          <span className="font-bold text-text">{getLogTypeLabel(log.type)}</span>
                        </div>
                        {log.reference_id && (
                          <div className="text-[9px] text-muted mt-0.5">Ref ID: #{log.reference_id}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-text">{log.recipient_name || 'System Admin'}</div>
                        <div className="text-[10px] text-muted font-mono mt-0.5">{log.recipient_phone || 'None'}</div>
                      </td>
                      <td className="p-4 max-w-xs truncate font-medium text-text select-text" title={log.message}>
                        {log.message}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase inline-flex items-center gap-1 border ${
                          log.status === 'sent'
                            ? 'bg-green/10 border-green/30 text-green'
                            : log.status === 'sent_manually'
                              ? 'bg-sky-500/10 border-sky-500/30 text-sky'
                              : log.status === 'pending'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                                : log.status === 'cancelled'
                                  ? 'bg-zinc-500/10 border-glass-border text-muted'
                                  : 'bg-red/10 border-red/30 text-red'
                        }`}>
                          {log.status === 'sent' && <CheckCircle2 size={10} />}
                          {log.status === 'failed' && <AlertCircle size={10} />}
                          {log.status === 'pending' && <Clock size={10} />}
                          {log.status.replace('_', ' ')}
                        </span>
                        {log.error_message && (
                          <div className="text-[9px] text-red mt-1 font-semibold max-w-[150px] truncate" title={log.error_message}>
                            Error: {log.error_message}
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-mono font-medium text-text select-none">
                        {new Date(log.created_at).toLocaleDateString()}
                        <div className="text-[10px] text-muted">
                           {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          {log.status === 'failed' && (
                            <button
                              onClick={() => handleRetryDispatch(log.id)}
                              className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 text-sky hover:text-white transition-all text-[10px] font-bold flex items-center gap-1"
                              title="Resend this message automatically via WhatsApp queue"
                            >
                              <Send size={11} />
                              Retry
                            </button>
                          )}
                          {(log.status === 'pending' || log.status === 'failed') && (
                            <button
                              onClick={() => handleCancelDispatch(log.id)}
                              className="p-1.5 rounded-lg bg-red/10 border border-red/25 hover:bg-red/20 text-red transition-all text-[10px] font-bold flex items-center gap-1"
                              title="Cancel this notification"
                            >
                              <Trash2 size={11} />
                              Cancel
                            </button>
                          )}
                          {log.status === 'failed' && (
                            <button
                              onClick={() => setManualSendNotification(log)}
                              className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-500 hover:text-white transition-all text-[10px] font-bold flex items-center gap-1"
                              title="Open manual copyable layout to dispatch to customer manually"
                            >
                              <ExternalLink size={11} />
                              Send Manually
                            </button>
                          )}
                          {log.status !== 'pending' && log.status !== 'failed' && (
                            <span className="text-[10px] text-muted italic select-none">No Action Required</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showReminderModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="glass-panel w-full max-w-md p-6 bg-bg2 border border-glass-border animate-slide-in shadow-2xl relative my-8">
            <h3 className="text-base font-bold text-text mb-4 border-b border-glass-border pb-3">
              {editingRefillId ? 'Modify Refill Reminder Configuration' : 'Register New Patient Refill Schedule'}
            </h3>
            <form onSubmit={handleSaveReminder} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Patient Name *</label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={e => setPatientName(e.target.value)}
                  placeholder="Patient Name"
                  className="premium-input w-full font-semibold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Patient Phone * (WhatsApp Number)</label>
                <input
                  type="tel"
                  required
                  value={patientPhone}
                  onChange={e => setPatientPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  maxLength={10}
                  className="premium-input w-full font-mono font-semibold"
                />
              </div>
              <div className="space-y-2 relative">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Select Inventory Medicines * (Multiple)</label>
                <input
                  type="text"
                  value={medicineQuery}
                  onChange={e => {
                    setMedicineQuery(e.target.value);
                  }}
                  onFocus={() => { if (medicineSearchResults.length > 0) setShowMedicineDropdown(true); }}
                  placeholder="Search inventory medicines..."
                  className="premium-input w-full font-semibold"
                />
                {loadingMedicineSearch && (
                  <div className="absolute right-3 top-8">
                    <RefreshCw size={14} className="animate-spin text-sky" />
                  </div>
                )}
                {showMedicineDropdown && medicineSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-bg3 border border-glass-border rounded-xl shadow-2xl z-[10000] max-h-48 overflow-y-auto scrollbar-thin">
                    {medicineSearchResults.map((med, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectMedicine(med)}
                        className="p-2.5 border-b border-glass-border/10 hover:bg-bg2/80 transition-colors cursor-pointer text-xs font-semibold text-text flex justify-between"
                      >
                        <span>{med.name}</span>
                        {med.strength && <span className="text-[10px] text-muted">{med.strength}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {selectedMedicines.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedMedicines.map(med => (
                      <div
                        key={med.id}
                        className="flex items-center justify-between p-2 bg-white/[0.03] border border-glass-border rounded-xl text-xs gap-2"
                      >
                        <span className="font-bold text-text truncate flex-1">{med.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted font-bold">QTY:</span>
                          <input
                            type="number"
                            min="1"
                            value={med.qty || 10}
                            onChange={e => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setSelectedMedicines(prev => prev.map(m => m.id === med.id ? { ...m, qty: val } : m));
                            }}
                            className="w-16 px-1.5 py-0.5 bg-black/40 border border-glass-border rounded font-mono text-center font-bold text-text focus:outline-none focus:border-primary/50"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveMedicine(med.id)}
                            className="p-1 rounded bg-red/10 border border-red/20 text-red hover:bg-red/20 transition-all ml-1"
                            title="Remove medicine"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-muted uppercase tracking-wider">Refill Cycle Interval (0 - 180 Days) *</label>
                  <span className="text-xs font-bold text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">{refillInterval} days</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="180"
                    value={refillInterval}
                    onChange={e => setRefillInterval(parseInt(e.target.value) || 0)}
                    className="flex-1 accent-primary h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                  <input
                    type="number"
                    required
                    value={refillInterval}
                    onChange={e => setRefillInterval(Math.max(0, Math.min(180, parseInt(e.target.value) || 0)))}
                    min="0"
                    max="180"
                    className="premium-input w-20 text-center font-mono font-semibold"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-glass-border">
                <button
                  type="button"
                  onClick={() => setShowReminderModal(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-glass-border text-muted hover:text-text hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="premium-btn bg-primary text-white shadow-[0_4px_14px_rgba(14,165,233,0.3)] px-4 py-2 text-xs"
                >
                  {modalSubmitting ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {manualSendNotification && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="glass-panel w-full max-w-lg p-6 bg-bg2 border border-glass-border animate-slide-in shadow-2xl my-8">
            <h3 className="text-base font-bold text-text mb-2 flex items-center gap-2">
              <ExternalLink size={18} className="text-amber-500" />
              Manual WhatsApp Send Assistant
            </h3>
            <p className="text-xs text-muted mb-4">
              Since automated dispatch failed, you can manually copy this message text and share it via WhatsApp Web.
            </p>
            <div className="space-y-4">
              <div className="p-3 bg-white/[0.02] border border-glass-border rounded-xl">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-muted font-bold uppercase block">Recipient Name</span>
                    <span className="font-bold text-text">{manualSendNotification.recipient_name || 'Customer'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted font-bold uppercase block">WhatsApp Number</span>
                    <span className="font-bold font-mono text-text">{manualSendNotification.recipient_phone}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Message Content</span>
                  <button
                    onClick={() => handleCopyMessage(manualSendNotification.message)}
                    className="text-[10px] text-sky hover:underline font-bold flex items-center gap-1"
                  >
                    <Copy size={11} />
                    Copy Text
                  </button>
                </div>
                <div className="p-4 bg-black/40 border border-glass-border rounded-xl text-xs font-medium text-text select-all font-sans whitespace-pre-wrap leading-relaxed shadow-inner">
                  {manualSendNotification.message}
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-glass-border">
                <button
                  type="button"
                  onClick={() => setManualSendNotification(null)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-glass-border text-muted hover:text-text hover:bg-white/5"
                >
                  Close Assistant
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkSentManually(manualSendNotification)}
                  className="premium-btn bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 hover:border-amber-500/60 text-amber-400 hover:text-white px-5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-[0_4px_14px_rgba(245,158,11,0.15)] animate-pulse-slow"
                >
                  <Send size={13} />
                  Open WhatsApp & Mark Sent
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default AutomationCenter;
