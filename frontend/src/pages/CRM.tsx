import { useEffect, useState, useCallback, useRef } from 'react';
import { Users, UserPlus, Search, Trash2, Edit2, X, Clock, ChevronRight, CheckCircle, MessageCircle, Send, RefreshCw, Mail, Smartphone } from 'lucide-react';
import { api } from '../services/api';

interface Patient {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
}

const emptyForm = { name: '', phone: '', address: '', notes: '' };

const CRM = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // WhatsApp states
  const [waChats, setWaChats] = useState<any[]>([]);
  const [waMessages, setWaMessages] = useState<any[]>([]);
  const [activeWaChat, setActiveWaChat] = useState<any>(null);
  const [waInput, setWaInput] = useState('');
  const [waLoading, setWaLoading] = useState(false);
  const [waStatus, setWaStatus] = useState({ isReady: false, qrUrl: null as string | null, message: '' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const showNotif = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchPatients = useCallback(async () => {
    try {
      const data = await api.getPatients();
      setPatients(Array.isArray(data) ? data.slice(0, 20) : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWaChats = useCallback(async () => {
    try {
      const data = await api.getWhatsappChats();
      setWaChats(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch WA chats', err);
    }
  }, []);

  const fetchWaStatus = useCallback(async () => {
    try {
      const data = await api.getWhatsappStatus();
      setWaStatus(prev => ({ ...prev, ...data }));
      if (data.isReady) {
        fetchWaChats();
      }
    } catch (err: any) {
      console.error("Failed to fetch WhatsApp Status", err);
      // Don't reset status on network errors – keep last known state
      setWaStatus(prev => ({ ...prev, message: 'Backend unreachable. Is the server running?' }));
    }
  }, [fetchWaChats]);

  const handleWaReconnect = async () => {
    try {
      setWaStatus({ isReady: false, qrUrl: null, message: 'Clearing old session and reinitializing...' });
      await api.reconnectWhatsapp();
      // Polling will pick up the new status/QR in a few seconds
    } catch (err) {
      console.error("Failed to reconnect WhatsApp", err);
      showNotif("Failed to clear session. Is server running?", "error");
    }
  };

  useEffect(() => { 
    fetchPatients(); 
    fetchWaStatus();
    const interval = setInterval(fetchWaStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchPatients, fetchWaStatus]);

  const loadWaMessages = async (chat: any) => {
    setActiveWaChat(chat);
    setWaLoading(true);
    try {
      const data = await api.getWhatsappMessages(chat.id);
      setWaMessages(Array.isArray(data) ? data.reverse() : []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error('Failed to fetch WA messages', err);
    } finally {
      setWaLoading(false);
    }
  };

  const sendWaMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waInput.trim() || !activeWaChat) return;
    const msg = waInput;
    setWaInput('');
    try {
      // Append optimistically
      setWaMessages(prev => [...prev, { id: Date.now(), body: msg, fromMe: true, timestamp: Date.now() / 1000 }]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      
      await api.sendWhatsappMessage(activeWaChat.id, msg);
      // Refresh messages quietly
      const data = await api.getWhatsappMessages(activeWaChat.id);
      setWaMessages(Array.isArray(data) ? data.reverse() : []);
    } catch (err) {
      showNotif('Failed to send WhatsApp message', 'error');
    }
  };

  const handlePatientWaClick = (phone?: string) => {
    if (!phone) return showNotif('No phone number available', 'error');
    // Sanitize phone
    const clean = phone.replace(/\D/g, '');
    const searchId = clean.length === 10 ? `91${clean}@c.us` : `${clean}@c.us`;
    const existing = Array.isArray(waChats) ? waChats.find(c => c.id === searchId) : null;
    if (existing) {
      loadWaMessages(existing);
    } else {
      showNotif('No existing WhatsApp chat found. Send a manual message first.', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showNotif('Name is required', 'error'); return; }
    setSaving(true);
    try {
      if (editingId !== null) {
        await api.updatePatient(editingId, form);
        showNotif('Patient updated successfully');
      } else {
        await api.addPatient(form);
        showNotif('Patient saved successfully');
      }
      setForm(emptyForm);
      setEditingId(null);
      fetchPatients();
    } catch (err) {
      showNotif('Failed to save patient', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p: Patient) => {
    setEditingId(p.id);
    setForm({ name: p.name, phone: p.phone || '', address: p.address || '', notes: p.notes || '' });
    setSelectedPatient(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this patient?')) return;
    try {
      await api.deletePatient(id);
      showNotif('Patient deleted');
      if (selectedPatient?.id === id) setSelectedPatient(null);
      fetchPatients();
    } catch { showNotif('Failed to delete', 'error'); }
  };

  const handleSelectPatient = async (p: Patient) => {
    setSelectedPatient(p);
    setHistoryLoading(true);
    setHistory([]);
    try {
      const data = await api.getPatientHistory(p.id);
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const filtered = patients.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (p.phone || '').includes(searchQuery);
    
    let matchesDate = true;
    if (dateFrom || dateTo) {
      if (!(p as any).created_at) {
        matchesDate = false;
      } else {
        const itemDate = (p as any).created_at.substring(0, 10);
        const start = dateFrom || '0000-00-00';
        const end = dateTo || '9999-99-99';
        matchesDate = itemDate >= start && itemDate <= end;
      }
    }
    
    return matchesSearch && matchesDate;
  });

  return (
    <div className="h-full flex flex-col fade-in space-y-6">
      {/* Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-[999999] flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl text-xs font-semibold
          ${notification.type === 'success' ? 'bg-green/15 border-green/30 text-green-200' : 'bg-red/15 border-red/30 text-red-200'}`}>
          <CheckCircle size={14} />
          {notification.msg}
        </div>
      )}

      {/* 2-Column Split Layout */}
      <div className="flex-1 flex gap-5 min-h-0">

        {/* ═══════ LEFT HALF: Form + Patient Directory ═══════ */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 gap-4">

          {/* Registration / Edit Form (compact horizontal row) */}
          <div className="glass-panel p-4 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2 text-sm">
                <UserPlus size={16} className="text-primary" />
                {editingId !== null ? 'Edit Patient' : 'Register New Patient'}
              </h3>
              {selectedPatient && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-sky">{selectedPatient.name}</span>
                  <button onClick={() => handlePatientWaClick(selectedPatient.phone)} className="flex items-center gap-1 bg-[#25D366]/20 text-[#25D366] px-2 py-0.5 rounded-full hover:bg-[#25D366]/30 transition-all font-bold">
                    <MessageCircle size={10} /> Send WA
                  </button>
                  <button onClick={() => showNotif('Email composer opened')} className="flex items-center gap-1 bg-red/20 text-red px-2 py-0.5 rounded-full hover:bg-red/30 transition-all font-bold">
                    <Mail size={10} /> Send Email
                  </button>
                  <button onClick={() => setSelectedPatient(null)} className="text-muted hover:text-white ml-2"><X size={12} /></button>
                </div>
              )}
            </div>
            <form onSubmit={handleSave} className="flex items-end gap-3 flex-wrap">
              {(['name', 'phone', 'address', 'notes'] as const).map(field => (
                <div key={field} className="space-y-1 flex-1 min-w-[120px]">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider">
                    {field.charAt(0).toUpperCase() + field.slice(1)}{field === 'name' ? ' *' : ''}
                  </label>
                  <input
                    type={field === 'phone' ? 'tel' : 'text'}
                    className="premium-input w-full text-xs"
                    placeholder={field === 'phone' ? '10-digit number' : field === 'notes' ? 'e.g. Diabetes, BP' : ''}
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    maxLength={field === 'phone' ? 10 : undefined}
                  />
                </div>
              ))}
              <div className="flex gap-2 shrink-0">
                <button
                  type="submit"
                  disabled={saving}
                  className="premium-btn bg-primary text-white shadow-[0_4px_14px_rgba(14,165,233,0.3)] hover:bg-sky-500 font-bold text-xs px-4"
                >
                  {saving ? 'Saving...' : editingId !== null ? 'Update' : 'Save'}
                </button>
                {editingId !== null && (
                  <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}
                    className="p-2 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 text-muted">
                    <X size={14} />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Unified Patient Timeline (Shows only when patient selected) */}
          {selectedPatient && (
            <div className="glass-panel p-4 shrink-0 border-sky/30 bg-sky/5 fade-in">
              <h3 className="font-bold text-sm flex items-center gap-2 mb-3 text-sky">
                <Clock size={16} /> Omnichannel Interaction History
              </h3>
              <div className="space-y-3 pl-2 border-l-2 border-sky/20">
                <div className="relative pl-4">
                  <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[#25D366] shadow-[0_0_8px_rgba(37,211,102,0.6)]"></div>
                  <p className="text-xs font-semibold text-text">System sent WhatsApp Refill Reminder</p>
                  <p className="text-[10px] text-muted">2 days ago • Automated</p>
                </div>
                <div className="relative pl-4">
                  <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-red shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
                  <p className="text-xs font-semibold text-text">Customer emailed new prescription PDF</p>
                  <p className="text-[10px] text-muted">1 week ago • Inbox</p>
                </div>
                <div className="relative pl-4">
                  <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-sky shadow-[0_0_8px_rgba(14,165,233,0.6)]"></div>
                  <p className="text-xs font-semibold text-text">Completed Purchase (Invoice #1042)</p>
                  <p className="text-[10px] text-muted">1 month ago • POS</p>
                </div>
              </div>
            </div>
          )}

          {/* Patient Directory Table (fills remaining vertical space) */}
          <div className="glass-panel flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="p-3 border-b border-glass-border bg-white/5 flex items-center gap-3 shrink-0">
              <Users size={16} className="text-sky" />
              <h3 className="font-bold text-sm flex-1">Patient Directory</h3>
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-2.5 text-muted" size={13} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name or phone..."
                  className="premium-input pl-8 pr-3 py-1.5 text-xs w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-muted">From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="px-2 py-1 bg-black/20 border border-glass-border rounded text-[10px] text-text focus:outline-none" />
                <label className="text-[10px] font-bold text-muted ml-1">To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="px-2 py-1 bg-black/20 border border-glass-border rounded text-[10px] text-text focus:outline-none" />
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-black/20">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
                  <tr>
                    {['ID', 'Name', 'Phone', 'Address', 'Notes', 'Actions'].map(h => (
                      <th key={h} className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted">Loading patients...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="p-12 text-center text-muted">
                      {searchQuery ? 'No patients match your search.' : 'No patients registered yet.'}
                    </td></tr>
                  ) : filtered.map(p => (
                    <tr key={p.id}
                      className={`hover:bg-white/5 transition-colors border-b border-glass-border/40 cursor-pointer ${selectedPatient?.id === p.id ? 'bg-primary/5' : ''}`}
                      onClick={() => handleSelectPatient(p)}
                    >
                      <td className="p-3 text-muted font-mono">{p.id}</td>
                      <td className="p-3 font-semibold text-text">{p.name}</td>
                      <td className="p-3 font-mono">{p.phone || '-'}</td>
                      <td className="p-3 text-muted max-w-[120px] truncate">{p.address || '-'}</td>
                      <td className="p-3 text-muted max-w-[100px] truncate">{p.notes || '-'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleSelectPatient(p)}
                            className="p-1.5 rounded hover:bg-sky/20 text-sky transition-colors" title="View History">
                            <ChevronRight size={13} />
                          </button>
                          <button onClick={() => handlePatientWaClick(p.phone)}
                            className="p-1.5 rounded hover:bg-green-500/20 text-green-500 transition-colors" title="Open WhatsApp Chat">
                            <MessageCircle size={13} />
                          </button>
                          <button onClick={() => handleEdit(p)}
                            className="p-1.5 rounded hover:bg-primary/20 text-primary transition-colors" title="Edit">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => handleDelete(p.id)}
                            className="p-1.5 rounded hover:bg-red/20 text-red-400 transition-colors" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-glass-border bg-black/10 text-[10px] text-muted px-4 shrink-0">
              Total Patients: <strong>{filtered.length}</strong>
            </div>
          </div>
        </div>

        {/* ═══════ RIGHT HALF: WhatsApp Interface (fixed 420px) ═══════ */}
        <div className="w-[420px] shrink-0 glass-panel flex flex-col overflow-hidden min-h-0 bg-[#0b141a] rounded-xl">
          {/* Header */}
          <div className="p-3 border-b border-white/5 bg-[#202c33] flex items-center gap-3 shrink-0 rounded-t-xl">
            <MessageCircle size={20} className="text-[#00a884]" />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-[#e9edef] truncate">
                {activeWaChat ? activeWaChat.name : 'WhatsApp Messages'}
              </h3>
              {activeWaChat && <p className="text-[10px] text-[#8696a0] truncate">{activeWaChat.id}</p>}
            </div>
            {activeWaChat ? (
              <button onClick={() => setActiveWaChat(null)} className="p-1.5 hover:bg-white/5 rounded-full text-[#aebac1]">
                <X size={16} />
              </button>
            ) : waStatus.isReady ? (
              <button 
                onClick={handleWaReconnect} 
                className="p-1.5 hover:bg-red/10 rounded-full text-[#aebac1] hover:text-red transition-colors"
                title="Disconnect & Scan New QR"
              >
                <RefreshCw size={14} />
              </button>
            ) : null}
          </div>

          {/* Body */}
          {!activeWaChat ? (
            <div className="flex-1 overflow-y-auto bg-[#111b21] custom-scrollbar">
              {waStatus.isReady ? (
                /* Connected – show chat list */
                waChats.length === 0 ? (
                  <div className="p-8 text-center text-[#8696a0] text-xs">No active chats. Send a message to start.</div>
                ) : (
                  waChats.map(chat => (
                    <button
                      key={chat.id}
                      onClick={() => loadWaMessages(chat)}
                      className="w-full text-left p-3 hover:bg-[#202c33] transition-colors border-b border-white/5 flex gap-3 items-center"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#374248] flex items-center justify-center shrink-0">
                        <UserPlus size={18} className="text-[#aebac1]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <span className="font-semibold text-sm text-[#e9edef] truncate">{chat.name}</span>
                          {chat.timestamp && <span className="text-[10px] text-[#8696a0]">{new Date(chat.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
                        </div>
                        <p className="text-[11px] text-[#8696a0] truncate">{chat.lastMessage || 'No recent messages'}</p>
                      </div>
                      {chat.unreadCount > 0 && (
                        <div className="bg-[#00a884] text-[#111b21] text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                          {chat.unreadCount}
                        </div>
                      )}
                    </button>
                  ))
                )
              ) : (
                /* Not connected – show QR or spinner */
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <div className="w-44 h-44 mx-auto bg-white rounded-xl flex items-center justify-center p-3 shadow-inner mb-5">
                    {waStatus.qrUrl ? (
                      <img src={waStatus.qrUrl} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
                    ) : (
                      <div className="animate-pulse flex flex-col items-center justify-center w-full h-full">
                        <div className="w-8 h-8 border-4 border-[#00a884]/30 border-t-[#00a884] rounded-full animate-spin mb-3"></div>
                        <span className="text-[10px] text-[#8696a0] font-bold text-center">Waiting for QR...<br/>Check terminal</span>
                      </div>
                    )}
                  </div>
                  <h3 className="text-[#e9edef] font-bold text-base mb-2">Connect WhatsApp</h3>
                  <p className="text-[#8696a0] text-[11px] max-w-[240px] leading-relaxed whitespace-pre-line mb-4">
                    {waStatus.message || "1. Open WhatsApp on your phone\n2. Tap Menu → Linked Devices\n3. Tap Link a Device\n4. Point your phone at this screen"}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchWaStatus}
                      className="text-xs font-bold bg-[#00a884]/20 text-[#00a884] px-4 py-1.5 rounded-full hover:bg-[#00a884]/30 transition-all"
                    >
                      Refresh Status
                    </button>
                    <button
                      onClick={handleWaReconnect}
                      className="text-xs font-bold bg-white/5 text-[#8696a0] border border-white/10 px-4 py-1.5 rounded-full hover:bg-white/10 hover:text-white transition-all"
                      title="Clear session and force new QR"
                    >
                      Reset Session
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundColor: '#0b141a' }}>
                {waLoading ? (
                  <div className="text-center text-[#8696a0] text-xs py-4">Loading messages...</div>
                ) : (
                  waMessages.map((msg, idx) => (
                    <div key={msg.id || idx} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg p-2 text-sm shadow-sm relative ${msg.fromMe ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'}`}>
                        {msg.body}
                        <div className="text-[9px] text-[#8696a0] mt-1 text-right float-right ml-3 pt-1">
                          {new Date(msg.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <form onSubmit={sendWaMessage} className="p-3 bg-[#202c33] flex items-center gap-2 shrink-0 rounded-b-xl">
                <input
                  type="text"
                  value={waInput}
                  onChange={e => setWaInput(e.target.value)}
                  placeholder="Type a message"
                  className="flex-1 bg-[#2a3942] border-none rounded-lg px-4 py-2 text-sm text-[#e9edef] focus:outline-none placeholder-[#8696a0]"
                />
                <button type="submit" disabled={!waInput.trim()} className="p-2 rounded-full text-[#8696a0] hover:text-[#00a884] disabled:opacity-50">
                  <Send size={20} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CRM;
