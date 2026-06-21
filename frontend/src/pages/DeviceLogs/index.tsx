import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Smartphone, 
  Clock, 
  Trash2, 
  ArrowLeft, 
  RefreshCw, 
  AlertTriangle, 
  Shield, 
  CheckCircle2, 
  Wifi, 
  WifiOff,
  Search,
  Filter,
  MessageSquare,
  Send,
  Calendar,
  Layers,
  Check,
  X,
  Database,
  Building,
  User,
  ExternalLink,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  Pill
} from 'lucide-react';
import { api, apiClient } from '../../services/api';
import { toastEvent } from '../../services/events';

interface Device {
  token: string;
  device_name: string;
  os: string;
  is_online: number;
  last_seen: string;
  offline_seconds: number;
}

interface ConnectionLog {
  id: number;
  token: string;
  device_name: string;
  os: string;
  status: 'connected' | 'disconnected';
  timestamp: string;
}

interface ActionLog {
  id: number;
  action_type: string;
  description: string;
  created_at: string;
}

interface Chat {
  id: string;
  name: string;
  unreadCount: number;
  timestamp: number;
  isGroup: boolean;
  lastMessage: string | null;
}

interface ChatMessage {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  hasMedia: boolean;
}

interface AssistantChatLog {
  id: number;
  session_id: string;
  device_name: string;
  sender: 'user' | 'assistant';
  message_text: string;
  metadata: string | null;
  created_at: string;
}

export default function DeviceLogs() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'action_logs' | 'chats' | 'assistant_chats' | 'transactions' | 'devices'>('action_logs');
  
  // Base states
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Tab 1: Action Logs States
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('all');

  // Tab 2: WhatsApp Chat States
  const [whatsappStatus, setWhatsappStatus] = useState<{ isReady: boolean; qrUrl: string | null; message?: string }>({ isReady: false, qrUrl: null });
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tab 2.5: Assistant Chat Logs (Mobile Assistant)
  const [assistantLogs, setAssistantLogs] = useState<AssistantChatLog[]>([]);
  const [selectedAssistantSession, setSelectedAssistantSession] = useState<string | null>(null);
  const [assistantLogsLoading, setAssistantLogsLoading] = useState(false);

  // Tab 3: Transactions timeline states
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txTypeFilter, setTxTypeFilter] = useState<'All' | 'Sale' | 'Purchase' | 'Return' | 'Adjustment'>('All');

  // Tab 4: Devices & Connection Logs States
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectionLogs, setConnectionLogs] = useState<ConnectionLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'disconnected'>('all');

  // Set page headers
  useEffect(() => {
    document.title = 'Activity & History Hub - AI Pharmacy';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Inspect system logs, whatsapp message streams, billing histories, and mobile client activities.');
    }
  }, []);

  // API Call: Fetch Action Logs
  const fetchActionLogs = useCallback(async () => {
    try {
      const res = await (api as any).getActionLogs();
      if (res && res.logs) {
        setActionLogs(res.logs);
      }
    } catch (err) {
      console.error('Failed to fetch action logs:', err);
    }
  }, []);

  // API Call: Fetch Assistant Chat Logs
  const fetchAssistantChatLogs = useCallback(async () => {
    setAssistantLogsLoading(true);
    try {
      const res = await (api as any).getAssistantChatLogs();
      if (res && res.logs) {
        setAssistantLogs(res.logs);
      }
    } catch (err) {
      console.error('Failed to fetch assistant chat logs:', err);
    } finally {
      setAssistantLogsLoading(false);
    }
  }, []);

  // API Call: Fetch Staged & Real Invoices (Transactions Timeline)
  const fetchTransactions = useCallback(async () => {
    try {
      const res = await api.getInvestigationTimeline({});
      if (Array.isArray(res)) {
        setTransactions(res);
      }
    } catch (err) {
      console.error('Failed to fetch investigation timeline:', err);
    }
  }, []);

  // API Call: Fetch Registered Devices & Connection Logs
  const fetchDeviceData = useCallback(async () => {
    try {
      const [devRes, logRes] = await Promise.all([
        apiClient.get('/notifications/devices'),
        apiClient.get('/notifications/devices/logs')
      ]);
      if (devRes.data?.devices) setDevices(devRes.data.devices);
      if (logRes.data?.logs) setConnectionLogs(logRes.data.logs);
    } catch (err) {
      console.error('Failed to fetch device data:', err);
    }
  }, []);

  // API Call: Fetch WhatsApp Connection Status & QR code
  const fetchWhatsappStatus = useCallback(async () => {
    try {
      const status = await api.getWhatsappStatus();
      setWhatsappStatus(status);
      if (status.isReady) {
        setChatsLoading(true);
        const chatData = await api.getWhatsappChats();
        if (Array.isArray(chatData)) {
          setChats(chatData);
        }
        setChatsLoading(false);
      } else {
        setChats([]);
        setSelectedChat(null);
        setMessages([]);
      }
    } catch (err) {
      console.warn('Failed to fetch WhatsApp client info:', err);
    }
  }, []);

  // API Call: Fetch Messages for Chat
  const fetchChatMessages = useCallback(async (chatId: string) => {
    setMessagesLoading(true);
    try {
      const msgList = await api.getWhatsappMessages(chatId);
      if (Array.isArray(msgList)) {
        setMessages(msgList);
      }
    } catch (err) {
      console.error('Failed to fetch chat messages:', err);
      toastEvent.trigger('Failed to fetch conversation history.', 'error');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Trigger loading based on active tab selection
  const refreshActiveData = useCallback(async (showIndicator = false) => {
    if (showIndicator) setLoading(true);
    
    try {
      if (activeTab === 'action_logs') {
        await fetchActionLogs();
      } else if (activeTab === 'chats') {
        await fetchWhatsappStatus();
      } else if (activeTab === 'assistant_chats') {
        await fetchAssistantChatLogs();
      } else if (activeTab === 'transactions') {
        await fetchTransactions();
      } else if (activeTab === 'devices') {
        await fetchDeviceData();
      }
    } catch (err) {
      console.error('Failed to load active tab data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchActionLogs, fetchWhatsappStatus, fetchAssistantChatLogs, fetchTransactions, fetchDeviceData]);

  // Initial load and periodic polling
  useEffect(() => {
    refreshActiveData(true);
    
    const interval = setInterval(() => {
      refreshActiveData(false);
    }, 10000); // 10 seconds poll
    
    return () => clearInterval(interval);
  }, [refreshActiveData]);

  // Watch chat selection
  useEffect(() => {
    if (selectedChat) {
      fetchChatMessages(selectedChat);
      const timer = setInterval(() => fetchChatMessages(selectedChat), 5000);
      return () => clearInterval(timer);
    }
  }, [selectedChat, fetchChatMessages]);

  // Scroll chat window to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedAssistantSession]);

  // Send WhatsApp message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !messageInput.trim()) return;

    setSendingMsg(true);
    try {
      // Find clean recipient phone number
      const cleanPhone = selectedChat.split('@')[0];
      await api.sendWhatsappMessage(cleanPhone, messageInput.trim());
      setMessageInput('');
      // Reload messages
      await fetchChatMessages(selectedChat);
    } catch (err) {
      toastEvent.trigger('Failed to send WhatsApp message.', 'error');
    } finally {
      setSendingMsg(false);
    }
  };

  // Clear handler for Action Logs
  const handleClearActionLogs = async () => {
    if (!window.confirm('Are you sure you want to delete all system action logs? This action is irreversible.')) return;
    setClearing(true);
    try {
      await (api as any).clearActionLogs();
      toastEvent.trigger('System action logs cleared.', 'success');
      setActionLogs([]);
    } catch (err) {
      toastEvent.trigger('Failed to clear action logs.', 'error');
    } finally {
      setClearing(false);
    }
  };

  // Clear handler for Assistant Chat Logs
  const handleClearAssistantChatLogs = async () => {
    if (!window.confirm('Are you sure you want to wipe all Mobile Assistant chat session history?')) return;
    setClearing(true);
    try {
      await (api as any).clearAssistantChatLogs();
      toastEvent.trigger('Assistant logs cleared successfully.', 'success');
      setAssistantLogs([]);
      setSelectedAssistantSession(null);
    } catch (err) {
      toastEvent.trigger('Failed to clear assistant logs.', 'error');
    } finally {
      setClearing(false);
    }
  };

  // Clear handler for Device Logs
  const handleClearDeviceLogs = async () => {
    if (!window.confirm('Are you sure you want to clear connection event logs?')) return;
    setClearing(true);
    try {
      await apiClient.post('/notifications/devices/logs/clear');
      toastEvent.trigger('Connection logs cleared.', 'success');
      setConnectionLogs([]);
    } catch (err) {
      toastEvent.trigger('Failed to clear connection logs.', 'error');
    } finally {
      setClearing(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const cleanIso = iso && !iso.includes('T') ? iso.replace(' ', 'T') + 'Z' : iso;
      const d = new Date(cleanIso);
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
    } catch {
      return iso;
    }
  };

  const formatChatTime = (timestamp: number) => {
    try {
      const d = new Date(timestamp * 1000);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Memo filters
  const filteredActionLogs = useMemo(() => {
    return actionLogs.filter(log => {
      const matchesSearch = log.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            log.action_type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = actionTypeFilter === 'all' || log.action_type === actionTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [actionLogs, searchQuery, actionTypeFilter]);

  const filteredChats = useMemo(() => {
    return chats.filter(chat => 
      chat.name.toLowerCase().includes(chatSearch.toLowerCase()) || 
      chat.id.includes(chatSearch)
    );
  }, [chats, chatSearch]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = 
        (t.reference || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (t.party || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (t.medicine_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.detail || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = txTypeFilter === 'All' || t.type === txTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [transactions, searchQuery, txTypeFilter]);

  const filteredConnectionLogs = useMemo(() => {
    return connectionLogs.filter(log => {
      const matchesSearch = log.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            log.os.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [connectionLogs, searchQuery, statusFilter]);

  // Group assistant logs by session_id
  const assistantSessions = useMemo(() => {
    const sessionsMap = new Map<string, { session_id: string; device_name: string; last_message: string; timestamp: string }>();
    
    // Sort chronological first so we can parse last_message easily
    const sorted = [...assistantLogs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    sorted.forEach(log => {
      sessionsMap.set(log.session_id, {
        session_id: log.session_id,
        device_name: log.device_name,
        last_message: log.message_text,
        timestamp: log.created_at
      });
    });

    return Array.from(sessionsMap.values()).reverse(); // latest sessions first
  }, [assistantLogs]);

  // Filter messages for active assistant session
  const activeAssistantMessages = useMemo(() => {
    if (!selectedAssistantSession) return [];
    return assistantLogs
      .filter(log => log.session_id === selectedAssistantSession)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [assistantLogs, selectedAssistantSession]);

  const deviceName = useMemo(() => {
    if (!selectedAssistantSession) return 'Unknown Device';
    const session = assistantSessions.find(s => s.session_id === selectedAssistantSession);
    return session ? session.device_name : 'Unknown Device';
  }, [assistantSessions, selectedAssistantSession]);

  // Action log types helper
  const uniqueActionTypes = useMemo(() => {
    const types = new Set(actionLogs.map(l => l.action_type));
    return Array.from(types);
  }, [actionLogs]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden text-text">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-glass-bg border border-glass-border p-4 rounded-2xl mb-4 shrink-0 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-bg border border-border hover:bg-bg3 hover:border-glass-border text-muted hover:text-white transition-all"
            title="Go Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
            <Clock size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Activity & History Center</h1>
            <p className="text-xs text-muted">Unified logs viewer for system events, messaging history, and client connections</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab Selection */}
          <div className="flex items-center bg-bg border border-border p-0.5 rounded-xl shrink-0">
            <button
              onClick={() => { setActiveTab('action_logs'); setSearchQuery(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'action_logs' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-white'
              }`}
            >
              <Database size={13} />
              <span>System Logs</span>
            </button>
            <button
              onClick={() => { setActiveTab('chats'); setSearchQuery(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'chats' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-white'
              }`}
            >
              <MessageSquare size={13} />
              <span>WhatsApp Chats</span>
            </button>
            <button
              onClick={() => { setActiveTab('assistant_chats'); setSearchQuery(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'assistant_chats' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-white'
              }`}
            >
              <Sparkles size={13} className="text-amber-400" />
              <span>Assistant Logs</span>
            </button>
            <button
              onClick={() => { setActiveTab('transactions'); setSearchQuery(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'transactions' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-white'
              }`}
            >
              <Layers size={13} />
              <span>Transactions</span>
            </button>
            <button
              onClick={() => { setActiveTab('devices'); setSearchQuery(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'devices' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-white'
              }`}
            >
              <Smartphone size={13} />
              <span>Devices</span>
            </button>
          </div>

          <button
            onClick={() => refreshActiveData(true)}
            className="p-2 rounded-xl bg-bg border border-border hover:bg-bg3 hover:border-glass-border text-muted hover:text-white transition-all"
            title="Refresh current log context"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-glass-bg border border-glass-border rounded-2xl backdrop-blur-xl">
        
        {/* TAB 1: ACTION & SYSTEM ACTIVITY LOGS */}
        {activeTab === 'action_logs' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Action Logs Control Bar */}
            <div className="p-4 border-b border-glass-border bg-white/[0.02] flex flex-col sm:flex-row gap-3 justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-xs uppercase tracking-wider text-muted">System Activity ({filteredActionLogs.length})</h2>
              </div>
              
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2.5 top-2 text-muted" size={13} />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="premium-input pl-8 pr-3 py-1 text-xs w-full bg-bg border border-border rounded-lg text-text focus:outline-none"
                  />
                </div>

                <select
                  value={actionTypeFilter}
                  onChange={e => setActionTypeFilter(e.target.value)}
                  className="premium-input px-2 py-1 text-xs bg-bg border border-border rounded-lg text-text focus:outline-none"
                >
                  <option value="all">All Action Types</option>
                  {uniqueActionTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>

                <button
                  onClick={handleClearActionLogs}
                  disabled={clearing || actionLogs.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  Clear Logs
                </button>
              </div>
            </div>

            {/* List Feed */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {loading && actionLogs.length === 0 ? (
                <div className="text-center py-20 text-muted">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-primary" />
                  Loading system activity logs...
                </div>
              ) : filteredActionLogs.length === 0 ? (
                <div className="text-center py-24 text-muted border border-dashed border-border rounded-xl">
                  <Database className="text-muted/10 mx-auto mb-2" size={42} />
                  <p className="font-bold text-xs">No matching system activity logs found</p>
                  <p className="text-[10px] mt-1">Logs will appear when backups run, tests complete, or system settings change.</p>
                </div>
              ) : (
                <div className="relative border-l border-border/40 pl-6 ml-3 space-y-4 py-2">
                  {filteredActionLogs.map((log) => {
                    let logColor = 'bg-primary border-primary/60';
                    let logText = 'text-primary bg-primary/10 border-primary/20';

                    if (log.action_type.includes('ERROR') || log.action_type.includes('FAIL')) {
                      logColor = 'bg-red border-red/60';
                      logText = 'text-red bg-red/10 border-red/20';
                    } else if (log.action_type.includes('RESET') || log.action_type.includes('RECOVERY')) {
                      logColor = 'bg-amber-500 border-amber-500/60';
                      logText = 'text-amber-500 bg-amber-500/10 border-amber-500/20';
                    } else if (log.action_type.includes('SUCCESS') || log.action_type === 'BACKUP') {
                      logColor = 'bg-green border-green/60';
                      logText = 'text-green bg-green/10 border-green/20';
                    }

                    return (
                      <div 
                        key={log.id} 
                        className="relative p-3 rounded-xl border bg-bg/25 border-border hover:border-glass-border/30 transition-colors flex items-center justify-between gap-4"
                      >
                        <div className={`absolute -left-[31px] top-4 w-2 h-2 rounded-full border-2 ${logColor}`} />
                        
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${logText}`}>
                              {log.action_type}
                            </span>
                            <span className="text-[10px] text-muted font-mono">{formatDate(log.created_at)}</span>
                          </div>
                          <p className="text-xs text-text">{log.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: WHATSAPP CHAT TIMELINE */}
        {activeTab === 'chats' && (
          <div className="flex-1 flex flex-row min-h-0 overflow-hidden divide-x divide-glass-border">
            {/* Left Chats Pane */}
            <div className="w-1/3 flex flex-col min-h-0 bg-white/[0.01]">
              <div className="p-3 border-b border-glass-border shrink-0">
                {/* Search in Chats */}
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2 text-muted" size={13} />
                  <input
                    type="text"
                    placeholder="Search chats..."
                    value={chatSearch}
                    onChange={e => setChatSearch(e.target.value)}
                    className="premium-input pl-8 pr-3 py-1 text-xs w-full bg-bg border border-border rounded-lg text-text focus:outline-none"
                  />
                </div>

                {/* WhatsApp Status Alert */}
                <div className={`p-2.5 rounded-xl border flex items-center gap-2 text-[10px] leading-tight ${
                  whatsappStatus.isReady 
                    ? 'bg-green/5 border-green/20 text-green shadow-[0_0_12px_rgba(34,197,94,0.05)]' 
                    : 'bg-red/5 border-red/20 text-red shadow-[0_0_12px_rgba(239,68,68,0.05)] animate-pulse'
                }`}>
                  {whatsappStatus.isReady ? <Wifi size={14} /> : <WifiOff size={14} />}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{whatsappStatus.isReady ? 'WhatsApp Service Connected' : 'WhatsApp Offline'}</p>
                    <p className="text-muted text-[9px] mt-0.5 truncate">{whatsappStatus.message || (whatsappStatus.isReady ? 'Listening to pings' : 'QR Scan required in Settings')}</p>
                  </div>
                </div>
              </div>

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-glass-border/40">
                {chatsLoading ? (
                  <div className="text-center py-10 text-xs text-muted">
                    <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-primary" />
                    Fetching chats...
                  </div>
                ) : !whatsappStatus.isReady ? (
                  <div className="p-6 text-center text-xs text-muted">
                    <AlertTriangle className="mx-auto mb-2 text-amber-500" size={24} />
                    <p className="font-bold text-white mb-1">Authorization Needed</p>
                    <p className="text-[10px] text-muted mb-3">WhatsApp automation server is not currently connected.</p>
                    {whatsappStatus.qrUrl ? (
                      <div className="flex flex-col items-center bg-white p-2 rounded-xl border border-glass-border max-w-[140px] mx-auto">
                        <img src={whatsappStatus.qrUrl} alt="WhatsApp QR Code" className="w-28 h-28" />
                        <span className="text-[8px] text-zinc-800 font-bold uppercase mt-1">Scan to login</span>
                      </div>
                    ) : (
                      <button 
                        onClick={() => navigate('/settings')}
                        className="px-3 py-1 bg-primary text-white font-bold rounded-lg text-[10px]"
                      >
                        Go to Settings
                      </button>
                    )}
                  </div>
                ) : filteredChats.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted">No chats found.</div>
                ) : (
                  filteredChats.map(chat => {
                    const isSelected = selectedChat === chat.id;
                    return (
                      <div
                        key={chat.id}
                        onClick={() => setSelectedChat(chat.id)}
                        className={`p-3 cursor-pointer select-none transition-all flex items-center justify-between gap-2.5 ${
                          isSelected ? 'bg-primary/15 border-l-2 border-primary' : 'hover:bg-black/[0.02]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-xs text-white truncate pr-1">{chat.name}</h4>
                            <span className="text-[9px] text-muted font-mono">{chat.timestamp ? formatChatTime(chat.timestamp) : ''}</span>
                          </div>
                          <p className="text-[10px] text-muted truncate">{chat.lastMessage || 'No messages'}</p>
                        </div>
                        {chat.unreadCount > 0 && (
                          <span className="w-4 h-4 rounded-full bg-green text-white font-bold text-[9px] flex items-center justify-center shrink-0">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Message Feed Pane */}
            <div className="flex-1 flex flex-col min-h-0 bg-black/[0.05]">
              {selectedChat ? (
                <>
                  {/* Chat Panel Header */}
                  <div className="p-3 border-b border-glass-border bg-white/[0.01] shrink-0 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-xs text-white">{chats.find(c => c.id === selectedChat)?.name || selectedChat}</h3>
                      <p className="text-[9px] text-muted truncate font-mono mt-0.5">{selectedChat}</p>
                    </div>
                  </div>

                  {/* Messages box */}
                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                    {messagesLoading && messages.length === 0 ? (
                      <div className="text-center py-20 text-muted">
                        <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-primary" />
                        Loading conversation history...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted">No messages found in this chat thread.</div>
                    ) : (
                      messages.map(msg => (
                        <div 
                          key={msg.id} 
                          className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`p-3 rounded-2xl max-w-[70%] text-xs shadow-sm border ${
                            msg.fromMe 
                              ? 'bg-primary/20 border-primary/20 text-white rounded-tr-none' 
                              : 'bg-bg2 border-border text-text rounded-tl-none'
                          }`}>
                            <p className="leading-snug break-words whitespace-pre-wrap">{msg.body}</p>
                            <span className="text-[8px] text-muted/65 font-mono block mt-1 text-right">
                              {formatChatTime(msg.timestamp)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input box */}
                  <form onSubmit={handleSendMessage} className="p-3 border-t border-glass-border shrink-0 bg-white/[0.01] flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Type a WhatsApp message..."
                      value={messageInput}
                      onChange={e => setMessageInput(e.target.value)}
                      disabled={sendingMsg}
                      className="premium-input flex-1 px-3 py-2 text-xs bg-bg border border-border rounded-xl text-text focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingMsg || !messageInput.trim()}
                      className="p-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all disabled:opacity-40"
                    >
                      {sendingMsg ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
                  <MessageSquare className="text-muted/10 mb-2" size={48} />
                  <p className="font-bold text-xs text-white">Select a Chat thread</p>
                  <p className="text-[10px] text-muted max-w-[200px] mt-1">Select a customer or contact from the left list to load the real-time message stream.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2.5: ASSISTANT CHAT LOGS (MOBILE CHAT SESSIONS) */}
        {activeTab === 'assistant_chats' && (
          <div className="flex-1 flex flex-row min-h-0 overflow-hidden divide-x divide-glass-border">
            {/* Left Sessions Pane */}
            <div className="w-1/3 flex flex-col min-h-0 bg-white/[0.01]">
              <div className="p-3 border-b border-glass-border bg-white/[0.01] flex justify-between items-center shrink-0">
                <h3 className="font-bold text-[10px] uppercase tracking-wider text-muted font-bold">Active Chat Sessions</h3>
                <button
                  onClick={handleClearAssistantChatLogs}
                  disabled={clearing || assistantLogs.length === 0}
                  className="px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[9px] font-bold"
                >
                  Wipe Logs
                </button>
              </div>

              {/* Sessions List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-glass-border/40">
                {assistantLogsLoading && assistantSessions.length === 0 ? (
                  <div className="text-center py-10 text-xs text-muted">
                    <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-primary" />
                    Loading chat logs...
                  </div>
                ) : assistantSessions.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted">
                    <Sparkles className="text-muted/10 mx-auto mb-2" size={32} />
                    No assistant chats recorded yet. Ask items on Mobile App!
                  </div>
                ) : (
                  assistantSessions.map(session => {
                    const isSelected = selectedAssistantSession === session.session_id;
                    return (
                      <div
                        key={session.session_id}
                        onClick={() => setSelectedAssistantSession(session.session_id)}
                        className={`p-3.5 cursor-pointer select-none transition-all flex flex-col gap-1.5 ${
                          isSelected ? 'bg-primary/15 border-l-2 border-primary' : 'hover:bg-black/[0.01]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Smartphone size={13} className="text-amber-400 shrink-0" />
                            <h4 className="font-bold text-xs text-white truncate">{session.device_name}</h4>
                          </div>
                          <span className="text-[9px] text-muted font-mono">{formatDate(session.timestamp).split(',')[1]?.trim() || ''}</span>
                        </div>
                        <p className="text-[10px] text-muted truncate pr-2">Last prompt: "{session.last_message}"</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Chat History Panel */}
            <div className="flex-1 flex flex-col min-h-0 bg-black/[0.03]">
              {selectedAssistantSession ? (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Session Header */}
                  <div className="p-3 border-b border-glass-border bg-white/[0.01] shrink-0 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-400" />
                        <h3 className="font-bold text-xs text-white">
                          Genius AI Session logs ({deviceName})
                        </h3>
                      </div>
                      <p className="text-[9px] text-muted font-mono mt-0.5">Session ID: {selectedAssistantSession}</p>
                    </div>
                  </div>

                  {/* Message Thread */}
                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                    {activeAssistantMessages.map((msg) => {
                      const isUser = msg.sender === 'user';
                      
                      // Check for search result products encoded in metadata
                      let parsedProducts: any[] = [];
                      if (msg.metadata) {
                        try {
                          parsedProducts = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
                          if (!Array.isArray(parsedProducts)) parsedProducts = [];
                        } catch (e) {
                          parsedProducts = [];
                        }
                      }

                      return (
                        <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                          <div className="flex items-center gap-1.5 text-[9px] text-muted uppercase tracking-wider px-1">
                            {!isUser && <Sparkles size={9} className="text-amber-400" />}
                            <span>{isUser ? 'User' : 'Assistant'}</span>
                            <span>&bull;</span>
                            <span>{formatDate(msg.created_at)}</span>
                          </div>

                          <div className={`p-3.5 rounded-2xl max-w-[85%] text-xs shadow-sm border ${
                            isUser 
                              ? 'bg-primary/25 border-primary/30 text-white rounded-tr-none' 
                              : 'bg-bg2 border-border text-text rounded-tl-none'
                          }`}>
                            <p className="leading-snug break-words whitespace-pre-wrap">{msg.message_text}</p>

                            {/* Render search results if present */}
                            {parsedProducts.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-border/55 space-y-2">
                                <span className="text-[9px] uppercase tracking-wider text-primary font-black flex items-center gap-1">
                                  <Pill size={11} /> Searched Inventory Results ({parsedProducts.length})
                                </span>
                                
                                <div className="grid grid-cols-1 gap-2.5">
                                  {parsedProducts.map((p, idx) => (
                                    <div key={idx} className="p-2 bg-bg border border-border/60 rounded-lg text-[10px] space-y-1">
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-white truncate max-w-[150px]">{p.medicine_name || p.name}</span>
                                        {p.quantity !== undefined && (
                                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                            p.quantity <= 0 ? 'bg-red/10 text-red border border-red/20' : 'bg-green/10 text-green border border-green/20'
                                          }`}>
                                            Stock: {p.quantity}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[9px] text-muted leading-none">
                                        {p.batch_no && `Batch: ${p.batch_no}`}
                                        {p.expiry_date && ` &bull; Exp: ${p.expiry_date}`}
                                        {p.mrp && ` &bull; MRP: ₹${Number(p.mrp).toFixed(2)}`}
                                        {p.distributor && ` &bull; Dist: ${p.distributor}`}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
                  <Sparkles className="text-muted/10 mb-2 animate-pulse-slow" size={54} />
                  <p className="font-bold text-xs text-white">Select an Assistant Chat Session</p>
                  <p className="text-[10px] text-muted max-w-[200px] mt-1">Select a logged device interaction from the left list to review user questions and Dolo 650/Clavam search timeline logs.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SALES & PURCHASES TIMELINE */}
        {activeTab === 'transactions' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header controls */}
            <div className="p-4 border-b border-glass-border bg-white/[0.02] flex flex-col sm:flex-row gap-3 justify-between items-center shrink-0">
              <h2 className="font-bold text-xs uppercase tracking-wider text-muted font-bold">Transaction History Feed ({filteredTransactions.length})</h2>
              
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2.5 top-2 text-muted" size={13} />
                  <input
                    type="text"
                    placeholder="Search invoices, medicines, etc..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="premium-input pl-8 pr-3 py-1 text-xs w-full bg-bg border border-border rounded-lg text-text focus:outline-none"
                  />
                </div>

                <select
                  value={txTypeFilter}
                  onChange={e => setTxTypeFilter(e.target.value as any)}
                  className="premium-input px-2 py-1 text-xs bg-bg border border-border rounded-lg text-text focus:outline-none"
                >
                  <option value="All">All Transactions</option>
                  <option value="Sale">POS Sales</option>
                  <option value="Purchase">Purchases</option>
                  <option value="Return">Supplier Returns</option>
                  <option value="Adjustment">Stock Adjustments</option>
                </select>
              </div>
            </div>

            {/* Timeline results */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {loading && transactions.length === 0 ? (
                <div className="text-center py-20 text-muted">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-primary" />
                  Loading transactions...
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-24 text-muted border border-dashed border-border rounded-xl">
                  <Layers className="text-muted/10 mx-auto mb-2" size={42} />
                  <p className="font-bold text-xs">No matching transactions found</p>
                  <p className="text-[10px] mt-1">Invoice pings will appear when sales or purchases are processed.</p>
                </div>
              ) : (
                <div className="relative border-l border-border/40 pl-6 ml-3 space-y-4 py-2">
                  {filteredTransactions.map((tx, idx) => {
                    const isSale = tx.type === 'Sale';
                    const isPurchase = tx.type === 'Purchase';
                    const isReturn = tx.type === 'Return';
                    
                    let typeBadge = 'bg-zinc-500/10 border-zinc-500/20 text-muted';
                    let typeIcon = <Layers size={13} />;
                    
                    if (isSale) {
                      typeBadge = 'bg-green/10 border-green/20 text-green';
                      typeIcon = <ArrowDownLeft size={13} />;
                    } else if (isPurchase) {
                      typeBadge = 'bg-sky-500/10 border-sky-500/20 text-sky-400';
                      typeIcon = <ArrowUpRight size={13} />;
                    } else if (isReturn) {
                      typeBadge = 'bg-amber-500/10 border-amber-500/20 text-amber-500';
                      typeIcon = <RefreshCw size={13} />;
                    }

                    return (
                      <div 
                        key={idx}
                        className="relative p-3.5 bg-bg/25 border border-border hover:border-glass-border/30 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        {/* Timeline dot */}
                        <div className={`absolute -left-[31px] top-5 w-2.5 h-2.5 rounded-full border-2 ${
                          isSale ? 'bg-green border-green/60' : isPurchase ? 'bg-sky-500 border-sky-500/60' : 'bg-amber-500 border-amber-500/60'
                        }`} />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border flex items-center gap-1 ${typeBadge}`}>
                              {typeIcon}
                              {tx.type}
                            </span>
                            <span className="text-[10px] text-muted font-mono">{formatDate(tx.date)}</span>
                            <span className="text-[10px] bg-bg3 border border-border text-muted px-2 py-0.5 rounded-full font-mono">Ref: {tx.reference}</span>
                          </div>

                          <div className="text-xs">
                            <span className="font-bold text-white block truncate mb-0.5">
                              {tx.medicine_name || tx.party || 'System Adjustment'}
                            </span>
                            <p className="text-[10px] text-muted leading-tight">
                              {isSale && `Sold ${tx.quantity} unit(s) to ${tx.party || 'Walk-in'}. Batch: ${tx.batch_no || 'N/A'}`}
                              {isPurchase && `Received ${tx.quantity} unit(s) from ${tx.party}. Batch: ${tx.batch_no || 'N/A'}`}
                              {isReturn && `Returned ${tx.quantity} unit(s) due to expiry. Batch: ${tx.batch_no || 'N/A'}`}
                              {!isSale && !isPurchase && !isReturn && `${tx.detail || 'Manual adjustment'}`}
                            </p>
                          </div>
                        </div>

                        {tx.mrp > 0 && (
                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-accent font-mono block">₹{Number(tx.mrp).toFixed(2)}</span>
                            <span className="text-[8px] text-muted block uppercase tracking-wider">Rate</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: DEVICES & CONNECTION EVENTS */}
        {activeTab === 'devices' && (
          <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden p-4">
            {/* Left Devices panel */}
            <div className="w-full md:w-1/3 flex flex-col bg-bg2/45 border border-border rounded-xl overflow-hidden shrink-0">
              <div className="p-3 border-b border-border bg-white/[0.01]">
                <h3 className="font-bold text-[10px] uppercase tracking-wider text-muted">Registered Devices ({devices.length})</h3>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
                {devices.length === 0 ? (
                  <div className="text-center py-10 text-xs text-muted border border-dashed border-border rounded-xl">
                    No devices registered.
                  </div>
                ) : (
                  devices.map(device => {
                    const isOnline = device.is_online === 1;
                    return (
                      <div key={device.token} className="p-3 bg-bg border border-border rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Smartphone size={15} className={isOnline ? 'text-green animate-pulse' : 'text-muted'} />
                            <span className="font-bold text-xs text-white truncate">{device.device_name}</span>
                          </div>
                          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green animate-ping' : 'bg-muted'}`} />
                        </div>
                        
                        <div className="text-[9px] font-mono text-muted flex items-center justify-between pt-1 border-t border-border/20">
                          <span className="capitalize">{device.os}</span>
                          <span>Seen: {device.last_seen ? formatChatTime(new Date(device.last_seen).getTime() / 1000) : 'Never'}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Connection Logs timeline */}
            <div className="flex-1 flex flex-col bg-bg2/45 border border-border rounded-xl overflow-hidden">
              <div className="p-3 border-b border-border bg-white/[0.01] flex justify-between items-center shrink-0">
                <h3 className="font-bold text-[10px] uppercase tracking-wider text-muted">Connection Logs ({filteredConnectionLogs.length})</h3>
                
                <button
                  onClick={handleClearDeviceLogs}
                  disabled={clearing || connectionLogs.length === 0}
                  className="px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[9px] font-bold"
                >
                  Clear Logs
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 custom-scrollbar">
                {filteredConnectionLogs.length === 0 ? (
                  <div className="text-center py-20 text-xs text-muted border border-dashed border-border rounded-xl">
                    No connection logs.
                  </div>
                ) : (
                  <div className="relative border-l border-border/40 pl-5 ml-2.5 space-y-3 py-1">
                    {filteredConnectionLogs.map(log => {
                      const isConn = log.status === 'connected';
                      return (
                        <div 
                          key={log.id} 
                          className="relative p-2.5 bg-bg border border-border rounded-xl flex items-center justify-between text-xs"
                        >
                          <div className={`absolute -left-[26px] top-4.5 w-1.5 h-1.5 rounded-full border ${
                            isConn ? 'bg-green border-green/60 shadow-sm' : 'bg-red border-red/60 shadow-sm'
                          }`} />

                          <div>
                            <span className="font-bold text-white">{log.device_name}</span>
                            <span className="text-[9px] text-muted capitalize ml-1.5">({log.os})</span>
                          </div>

                          <div className="text-right flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                              isConn ? 'bg-green/10 border-green/20 text-green' : 'bg-red/10 border-red/20 text-red'
                            }`}>
                              {log.status}
                            </span>
                            <span className="text-[9px] text-muted font-mono">{formatDate(log.timestamp)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
      
    </div>
  );
}
