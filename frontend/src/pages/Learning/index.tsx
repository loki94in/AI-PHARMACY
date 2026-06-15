// AI Learning Profile Dashboard (Agent 2)
import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  Database, 
  FileText, 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Settings,
  HelpCircle,
  ArrowRight,
  MessageCircle,
  Send,
  Zap,
  Mail,
  Bell,
  Globe,
  Copy,
  LogIn,
  LogOut,
  Plus
} from 'lucide-react';
import { apiClient } from '../../services/api';
import { toastEvent } from '../../services/events';

interface LearningProfileSummary {
  distributor_id: number;
  distributor_name: string;
  distributor_email: string | null;
  last_updated: string | null;
  files_count: number;
  last_status: string | null;
}

interface HistoricalFile {
  id: number;
  distributor_id: number;
  filename: string;
  file_path: string;
  file_type: string;
  file_headers: string; // JSON array
  mapping_config: string; // JSON object
  extracted_data: string; // JSON array
  status: string;
  created_at: string;
}

interface ProfileDetail {
  distributor_id: number;
  file_mapping_rules: string;
  last_updated: string;
}

const Learning: React.FC = () => {
  const [profiles, setProfiles] = useState<LearningProfileSummary[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<{
    distributor: any;
    profile: ProfileDetail | null;
    files: HistoricalFile[];
  } | null>(null);
  
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Settings/Automation toggles state
  const [settingsData, setSettingsData] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSetting, setSavingSetting] = useState<string | null>(null);

  // Configuration UI toggle states
  const [showWaConfig, setShowWaConfig] = useState(false);
  const [showWaBusConfig, setShowWaBusConfig] = useState(false);
  const [showTgConfig, setShowTgConfig] = useState(false);
  const [showEmailConfig, setShowEmailConfig] = useState(false);
  const [showPrConfig, setShowPrConfig] = useState(false);

  // WhatsApp Web Status
  const [waStatus, setWaStatus] = useState({ isReady: false, qrUrl: null as string | null, message: '' });
  const [isOpeningWaWindow, setIsOpeningWaWindow] = useState(false);

  // WhatsApp Business API testing
  const [waBusinessTesting, setWaBusinessTesting] = useState(false);
  const [waBusinessTestResult, setWaBusinessTestResult] = useState<{ success?: boolean; phone?: string; name?: string; error?: string } | null>(null);

  // Pharmarack link login
  const [isOpeningWindow, setIsOpeningWindow] = useState(false);
  const [prHealth, setPrHealth] = useState<{ healthy: boolean; mode: 'Live' | 'Simulation'; reason?: string; message?: string } | null>(null);
  const [checkingPrHealth, setCheckingPrHealth] = useState(false);

  const checkPrHealth = async () => {
    setCheckingPrHealth(true);
    try {
      const res = await apiClient.get('/pharmarack/session-status');
      setPrHealth(res.data);
    } catch (err) {
      console.error('Failed to check Pharmarack session health:', err);
      setPrHealth(prev => prev || { healthy: false, mode: 'Live', reason: 'NETWORK_ERROR', message: 'Could not contact server' });
    } finally {
      setCheckingPrHealth(false);
    }
  };

  // New distributor creation states
  const [showAddDistModal, setShowAddDistModal] = useState(false);
  const [newDistName, setNewDistName] = useState('');
  const [newDistPhone, setNewDistPhone] = useState('');
  const [newDistEmail, setNewDistEmail] = useState('');

  const handleAddDistributor = async () => {
    if (!newDistName.trim()) {
      toastEvent.trigger('Distributor name is required', 'error');
      return;
    }
    try {
      const res = await apiClient.post('/settings/distributors', {
        name: newDistName.trim(),
        phone: newDistPhone.trim(),
        email: newDistEmail.trim()
      });
      if (res.data && res.data.success) {
        toastEvent.trigger('Distributor added successfully', 'success');
        setShowAddDistModal(false);
        setNewDistName('');
        setNewDistPhone('');
        setNewDistEmail('');
        fetchProfiles();
      }
    } catch (err) {
      console.error('Failed to add distributor', err);
      toastEvent.trigger('Failed to add distributor', 'error');
    }
  };

  const handleSaveConfig = async (updatedSettings = settingsData) => {
    try {
      await apiClient.post('/settings/save', updatedSettings);
      toastEvent.trigger('Settings saved successfully', 'success');
      // Refresh settings
      const { data } = await apiClient.get('/settings');
      if (data) {
        setSettingsData(data);
        checkPrHealth();
      }
    } catch (error) {
      console.error('Failed to save settings', error);
      toastEvent.trigger('Failed to save settings', 'error');
    }
  };

  useEffect(() => {
    let timer: any;
    if (settingsData?.whatsapp_enabled === 'true' && !waStatus.isReady) {
      const fetchQR = async () => {
        try {
          const { data } = await apiClient.get('/messaging/qr');
          setWaStatus(data);
        } catch (error) {
          console.error("Failed to fetch WhatsApp QR", error);
        }
      };
      fetchQR();
      timer = setInterval(fetchQR, 5000);
    }
    return () => clearInterval(timer);
  }, [settingsData?.whatsapp_enabled, waStatus.isReady]);

  const handleReconnect = async () => {
    try {
      setWaStatus({ isReady: false, qrUrl: null, message: 'Reconnecting...' });
      await apiClient.post('/messaging/reconnect');
      toastEvent.trigger('WhatsApp reconnecting...', 'info');
    } catch (error) {
      console.error('Failed to reconnect', error);
      toastEvent.trigger('Failed to reconnect WhatsApp', 'error');
    }
  };

  const handleOpenWaLoginWindow = async () => {
    setIsOpeningWaWindow(true);
    try {
      toastEvent.trigger('Launching Chrome login window for WhatsApp...', 'info');
      await apiClient.post('/messaging/login-window');
    } catch (err: any) {
      console.error('Failed to open WhatsApp login window:', err);
      toastEvent.trigger(err?.response?.data?.error || 'Failed to open Chrome login window. Ensure Chrome is installed.', 'error');
    } finally {
      setIsOpeningWaWindow(false);
    }
  };

  const handleTestWaBusiness = async () => {
    setWaBusinessTesting(true);
    setWaBusinessTestResult(null);
    try {
      await apiClient.post('/settings/save', settingsData);
      const { data } = await apiClient.post('/wa-business/test');
      setWaBusinessTestResult(data);
    } catch (err: any) {
      setWaBusinessTestResult({ success: false, error: err?.response?.data?.error || 'Connection failed' });
    } finally {
      setWaBusinessTesting(false);
    }
  };

  const copyWebhookUrl = () => {
    const url = `${window.location.origin}/api/wa-business/webhook`;
    navigator.clipboard.writeText(url);
    toastEvent.trigger('Webhook URL copied!', 'success');
  };

  const handleOpenLoginWindow = async () => {
    setIsOpeningWindow(true);
    try {
      await apiClient.post('/pharmarack/login-window');
      toastEvent.trigger('Google Chrome window opened. Please log in on retailers.pharmarack.com.', 'info');
      
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        if (attempts > 90) { 
          clearInterval(interval);
          setIsOpeningWindow(false);
          return;
        }

        try {
          const { data } = await apiClient.get('/settings');
          if (data && data.pharmarack_session_token && data.pharmarack_session_token !== settingsData?.pharmarack_session_token) {
            setSettingsData(data);
            toastEvent.trigger('Successfully linked Pharmarack session!', 'success');
            clearInterval(interval);
            setIsOpeningWindow(false);
            checkPrHealth();
          }
        } catch (err) {
          console.warn('Failed to poll settings status:', err);
        }
      }, 2000);
    } catch (err: any) {
      console.error('Failed to open login window:', err);
      toastEvent.trigger(err?.response?.data?.error || 'Failed to open Chrome login window. Ensure Chrome is installed.', 'error');
      setIsOpeningWindow(false);
    }
  };

  const handlePharmarackLogout = async () => {
    const updated = {
      ...settingsData,
      pharmarack_username: '',
      pharmarack_password: '',
      pharmarack_session_token: '',
      pharmarack_mode: 'Simulation'
    };
    setSettingsData(updated);
    try {
      await apiClient.post('/settings/save', updated);
      toastEvent.trigger('Logged out and cleared Pharmarack credentials successfully.', 'success');
      checkPrHealth();
    } catch (error) {
      console.error('Failed to logout from Pharmarack', error);
      toastEvent.trigger('Failed to logout from Pharmarack', 'error');
    }
  };

  // Manual trainer editing state
  const [mappingRules, setMappingRules] = useState<Record<string, string>>({
    name: '',
    quantity: '',
    rate: '',
    mrp: '',
    batch_no: '',
    expiry_date: '',
    free_qty: '',
    cgst: '',
    sgst: '',
    global_cd_per: '',
    invoice_no: '',
    invoice_date: '',
    total_amount: ''
  });
  const [savingMapping, setSavingMapping] = useState(false);

  // Comparator modal state
  const [comparatorFileId, setComparatorFileId] = useState<number | null>(null);
  const [comparatorData, setComparatorData] = useState<{
    filename: string;
    file_type: string;
    file_headers: string[];
    mapping_config: Record<string, string>;
    extracted_data: any[];
    status: string;
    created_at: string;
  } | null>(null);
  const [loadingComparator, setLoadingComparator] = useState(false);

  useEffect(() => {
    fetchProfiles();
    const initPr = async () => {
      try {
        const { data } = await apiClient.get('/pharmarack/auto-verify');
        setPrHealth(data);
      } catch (err) {
        console.error('Failed initial Pharmarack verification:', err);
      }
      fetchSettings();
    };
    initPr();
    
    const interval = setInterval(checkPrHealth, 180000); // Poll every 3 minutes
    return () => clearInterval(interval);
  }, []);

  const fetchProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const res = await apiClient.get('/learning/profiles');
      if (res.data && res.data.success) {
        setProfiles(res.data.profiles || []);
      }
    } catch (err) {
      console.error('Failed to fetch learning profiles:', err);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const fetchSettings = async () => {
    setLoadingSettings(true);
    try {
      const { data } = await apiClient.get('/settings');
      if (data) {
        setSettingsData(data);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleToggleSetting = async (key: string) => {
    if (!settingsData) return;
    const currentValue = settingsData[key] === 'true';
    const updatedValue = !currentValue;
    
    // Optimistic update
    const updatedSettings = {
      ...settingsData,
      [key]: updatedValue.toString()
    };
    setSettingsData(updatedSettings);
    setSavingSetting(key);
    
    try {
      await apiClient.post('/settings/save', updatedSettings);
      toastEvent.trigger(`Automation feature updated successfully`, 'success');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toastEvent.trigger('Failed to update automation feature settings', 'error');
      // Revert state
      setSettingsData(settingsData);
    } finally {
      setSavingSetting(null);
    }
  };

  const fetchProfileDetail = async (distId: number) => {
    setLoadingDetail(true);
    setSelectedProfileId(distId);
    try {
      const res = await apiClient.get(`/learning/profiles/${distId}`);
      if (res.data && res.data.success) {
        setSelectedProfile(res.data);
        
        // Populate manual rules form
        const rules = res.data.profile?.file_mapping_rules 
          ? JSON.parse(res.data.profile.file_mapping_rules) 
          : {};
        
        setMappingRules({
          name: rules.name || '',
          quantity: rules.quantity || '',
          rate: rules.rate || '',
          mrp: rules.mrp || '',
          batch_no: rules.batch_no || '',
          expiry_date: rules.expiry_date || '',
          free_qty: rules.free_qty || '',
          cgst: rules.cgst || '',
          sgst: rules.sgst || '',
          global_cd_per: rules.global_cd_per || '',
          invoice_no: rules.invoice_no || '',
          invoice_date: rules.invoice_date || '',
          total_amount: rules.total_amount || ''
        });
      }
    } catch (err) {
      console.error('Failed to fetch profile details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const saveMapping = async () => {
    if (!selectedProfileId) return;
    setSavingMapping(true);
    try {
      // Filter out empty rules
      const cleanRules: Record<string, string> = {};
      Object.keys(mappingRules).forEach(key => {
        if (mappingRules[key].trim()) {
          cleanRules[key] = mappingRules[key].trim();
        }
      });

      const res = await apiClient.post(`/learning/profiles/${selectedProfileId}/mapping`, {
        mappingRules: cleanRules
      });
      if (res.data && res.data.success) {
        toastEvent.trigger('Column mapping rules saved successfully.', 'success');
        fetchProfiles();
        fetchProfileDetail(selectedProfileId);
      }
    } catch (err) {
      console.error('Failed to save manual mappings:', err);
      toastEvent.trigger('Failed to save mapping rules.', 'error');
    } finally {
      setSavingMapping(false);
    }
  };

  const resetProfile = async () => {
    if (!selectedProfileId) return;
    if (!window.confirm('Are you sure you want to reset this profile? This will delete all historical reference files and reset learned mappings.')) return;
    
    try {
      const res = await apiClient.post(`/learning/profiles/${selectedProfileId}/reset`);
      if (res.data && res.data.success) {
        toastEvent.trigger('Learning profile reset successfully.', 'success');
        setSelectedProfile(null);
        setSelectedProfileId(null);
        fetchProfiles();
      }
    } catch (err) {
      console.error('Failed to reset profile:', err);
      toastEvent.trigger('Failed to reset profile.', 'error');
    }
  };

  const deleteHistoricalFile = async (fileId: number) => {
    if (!window.confirm('Delete this historical file reference?')) return;
    try {
      const res = await apiClient.delete(`/learning/historical-files/${fileId}`);
      if (res.data && res.data.success) {
        toastEvent.trigger('Historical file reference deleted.', 'success');
        if (selectedProfileId) {
          fetchProfileDetail(selectedProfileId);
          fetchProfiles();
        }
      }
    } catch (err) {
      console.error('Failed to delete file:', err);
      toastEvent.trigger('Failed to delete file reference.', 'error');
    }
  };

  const loadComparator = async (fileId: number) => {
    setComparatorFileId(fileId);
    setLoadingComparator(true);
    try {
      const res = await apiClient.get(`/learning/historical-files/${fileId}/data`);
      if (res.data && res.data.success) {
        setComparatorData(res.data.file);
      }
    } catch (err) {
      console.error('Failed to load comparator data:', err);
      setComparatorFileId(null);
    } finally {
      setLoadingComparator(false);
    }
  };

  const hasSelected = selectedProfileId !== null;

  return (
    <div className="h-full flex flex-col fade-in relative gap-4 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 min-h-0 overflow-hidden">
        {/* Column 1: AI Automation Center */}
        <div className={`${hasSelected ? 'lg:col-span-4' : 'lg:col-span-6'} bg-glass-bg border border-glass-border rounded-2xl p-5 flex flex-col h-full overflow-hidden transition-all duration-300`}>
          <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2 border-b border-glass-border pb-3 shrink-0">
            <Brain size={16} className="text-sky animate-pulse" />
            AI Automation Center
          </h3>
          
          <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-4 custom-scrollbar">
            
            {loadingSettings ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted">
                <RefreshCw className="animate-spin text-sky" size={20} />
                <span className="text-xs">Loading automation states...</span>
              </div>
            ) : settingsData ? (
              <div className="space-y-3">
                {/* 1. WhatsApp Web Integration */}
                <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-text flex items-center gap-2">
                        <MessageCircle size={14} className="text-emerald-400" />
                        WhatsApp Web
                      </h4>
                      <p className="text-[10px] text-muted leading-normal">
                        Send instant notifications, refills, and PDF receipts via a standard linked browser session.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settingsData.whatsapp_enabled === 'true'} 
                        onChange={() => handleToggleSetting('whatsapp_enabled')}
                        disabled={savingSetting === 'whatsapp_enabled'}
                      />
                      <div className="w-9 h-5 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors peer-disabled:opacity-50" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50" />
                    </label>
                  </div>
                  {settingsData.whatsapp_enabled === 'true' && (
                    <div className="text-[9px] bg-bg2 border border-glass-border rounded px-2 py-1 flex items-center justify-between text-muted">
                      <span>Status: <strong className="text-green uppercase font-semibold text-[9px]">Active Engine</strong></span>
                      <button 
                        onClick={() => setShowWaConfig(!showWaConfig)}
                        className="text-sky hover:underline font-bold uppercase tracking-wider text-[9px]"
                      >
                        {showWaConfig ? 'Close configuration' : 'Configure session'}
                      </button>
                    </div>
                  )}

                  {showWaConfig && (
                    <div className="flex flex-col gap-3 mt-2 pt-3 border-t border-glass-border/40">
                      <div className="flex items-center justify-center p-4 border-2 border-dashed border-glass-border/30 rounded-xl bg-bg2/30">
                        <div className="text-center space-y-3">
                          <div className="w-32 h-32 mx-auto bg-bg2 rounded-xl flex items-center justify-center p-2 border border-glass-border">
                            {waStatus.isReady ? (
                              <div className="flex flex-col items-center justify-center w-full h-full text-green">
                                <MessageCircle size={36} className="mb-1" />
                                <span className="font-bold text-xs">Connected!</span>
                              </div>
                            ) : waStatus.qrUrl ? (
                              <img src={waStatus.qrUrl} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
                            ) : (
                              <div className="animate-pulse flex flex-col items-center justify-center w-full h-full">
                                <div className="w-6 h-6 border-3 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin mb-2"></div>
                                <span className="text-[9px] text-muted font-bold text-center">Loading QR...</span>
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-muted max-w-xs mx-auto leading-normal">
                            {waStatus.isReady 
                              ? "Your WhatsApp account is linked and active."
                              : waStatus.message || "Scan the QR code to link your account."}
                          </p>
                          <div className="flex flex-wrap gap-2 justify-center mt-1">
                            {!waStatus.isReady && (
                              <>
                                <button 
                                  onClick={handleOpenWaLoginWindow}
                                  disabled={isOpeningWaWindow}
                                  className="text-[10px] font-bold bg-green/20 text-green px-3 py-1.5 rounded-full hover:bg-green/30 transition-all flex items-center gap-1 disabled:opacity-50"
                                  title="Open Chrome to log in to WhatsApp Web"
                                >
                                  <LogIn size={10} />
                                  {isOpeningWaWindow ? 'Opening...' : 'Chrome Login'}
                                </button>
                                <button 
                                  onClick={() => setWaStatus({ ...waStatus, qrUrl: null })}
                                  className="text-[10px] font-bold bg-primary/20 text-primary px-3 py-1.5 rounded-full hover:bg-primary/30 transition-all"
                                >
                                  Refresh QR
                                </button>
                              </>
                            )}
                            <button 
                              onClick={handleReconnect}
                              className="text-[10px] font-bold bg-red-500/20 text-red-400 px-3 py-1.5 rounded-full hover:bg-red-500/30 transition-all flex items-center gap-1"
                            >
                              <LogOut size={10} /> Log Out WhatsApp
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. WhatsApp Business API */}
                <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-text flex items-center gap-2">
                        <Zap size={14} className="text-green" />
                        WhatsApp Business API
                      </h4>
                      <p className="text-[10px] text-muted leading-normal">
                        Use official Meta cloud API to reliably deliver messages at scale using pre-approved templates.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settingsData.wa_business_enabled === 'true'} 
                        onChange={() => handleToggleSetting('wa_business_enabled')}
                        disabled={savingSetting === 'wa_business_enabled'}
                      />
                      <div className="w-9 h-5 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors peer-disabled:opacity-50" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50" />
                    </label>
                  </div>
                  {settingsData.wa_business_enabled === 'true' && (
                    <div className="text-[9px] bg-bg2 border border-glass-border rounded px-2 py-1 flex items-center justify-between text-muted">
                      <span>Status: <strong className="text-green uppercase font-semibold text-[9px]">Cloud Ready</strong></span>
                      <button 
                        onClick={() => setShowWaBusConfig(!showWaBusConfig)}
                        className="text-sky hover:underline font-bold uppercase tracking-wider text-[9px]"
                      >
                        {showWaBusConfig ? 'Close settings' : 'Settings'}
                      </button>
                    </div>
                  )}

                  {showWaBusConfig && (
                    <div className="flex flex-col gap-3 mt-2 pt-3 border-t border-glass-border/40 text-left">
                      <div className="grid grid-cols-1 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Phone Number ID</label>
                          <input
                            type="text"
                            className="premium-input w-full text-xs"
                            placeholder="Phone Number ID"
                            value={settingsData.wa_business_phone_number_id || ''}
                            onChange={(e) => setSettingsData({ ...settingsData, wa_business_phone_number_id: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Access Token</label>
                          <input
                            type="password"
                            className="premium-input w-full text-xs"
                            placeholder="Access Token"
                            value={settingsData.wa_business_access_token || ''}
                            onChange={(e) => setSettingsData({ ...settingsData, wa_business_access_token: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted uppercase tracking-wider">WABA ID</label>
                          <input
                            type="text"
                            className="premium-input w-full text-xs"
                            placeholder="Business Account ID"
                            value={settingsData.wa_business_waba_id || ''}
                            onChange={(e) => setSettingsData({ ...settingsData, wa_business_waba_id: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Verify Token</label>
                          <input
                            type="text"
                            className="premium-input w-full text-xs"
                            placeholder="Webhook Verify Token"
                            value={settingsData.wa_business_webhook_verify_token || ''}
                            onChange={(e) => setSettingsData({ ...settingsData, wa_business_webhook_verify_token: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="bg-bg2/40 p-2.5 flex items-center justify-between border border-glass-border rounded-lg mt-1">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <Globe size={12} className="text-sky flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[8px] text-muted uppercase font-bold tracking-wider">Webhook URL</p>
                            <p className="text-[10px] text-sky font-mono truncate">{window.location.origin}/api/wa-business/webhook</p>
                          </div>
                        </div>
                        <button
                          onClick={copyWebhookUrl}
                          className="text-[9px] font-bold bg-sky-500/20 text-sky px-2 py-1 rounded-full hover:bg-sky-500/30 transition-all flex items-center gap-0.5 flex-shrink-0"
                        >
                          <Copy size={9} /> Copy
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <button
                          onClick={() => handleSaveConfig()}
                          className="text-[10px] font-bold bg-green/20 text-green px-3.5 py-1.5 rounded-lg hover:bg-green/35 transition-all"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleTestWaBusiness}
                          disabled={waBusinessTesting || !settingsData.wa_business_phone_number_id || !settingsData.wa_business_access_token}
                          className="text-[10px] font-bold bg-sky-500/20 text-sky px-3 py-1.5 rounded-lg hover:bg-sky-500/30 transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {waBusinessTesting ? 'Testing...' : 'Test connection'}
                        </button>
                        {waBusinessTestResult && (
                          <span className={`text-[9px] font-bold px-2 py-1 rounded-full truncate max-w-[120px] ${
                            waBusinessTestResult.success ? 'bg-green/10 text-green' : 'bg-red-500/10 text-red-400'
                          }`}>
                            {waBusinessTestResult.success ? 'Connected' : 'Failed'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2.5 Preferred System (Visible if both WhatsApp Web and Business API are enabled) */}
                {settingsData.whatsapp_enabled === 'true' && settingsData.wa_business_enabled === 'true' && (
                  <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex flex-col gap-3">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-text flex items-center gap-2">
                        <MessageCircle size={14} className="text-amber" />
                        Preferred WhatsApp Channel
                      </h4>
                      <p className="text-[10px] text-muted leading-normal">
                        Both Automated WhatsApp Web and Official Business API are enabled. Choose which one to use as the default sender:
                      </p>
                    </div>
                    <select
                      className="premium-input w-full text-xs py-1.5"
                      value={settingsData.whatsapp_preferred_system || 'automated'}
                      onChange={(e) => {
                        const updated = {
                          ...settingsData,
                          whatsapp_preferred_system: e.target.value
                        };
                        setSettingsData(updated);
                        handleSaveConfig(updated);
                      }}
                    >
                      <option value="automated" className="bg-bg text-text">Automated WhatsApp Web Client</option>
                      <option value="official" className="bg-bg text-text">Official WhatsApp Business Cloud API</option>
                    </select>
                  </div>
                )}

                {/* 3. Telegram Orders Bot */}
                <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-text flex items-center gap-2">
                        <Send size={14} className="text-sky" />
                        Telegram Orders Bot
                      </h4>
                      <p className="text-[10px] text-muted leading-normal">
                        Receive instant customer orders, prescription uploads, and run AI processing in real-time.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settingsData.telegram_enabled === 'true'} 
                        onChange={() => handleToggleSetting('telegram_enabled')}
                        disabled={savingSetting === 'telegram_enabled'}
                      />
                      <div className="w-9 h-5 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors peer-disabled:opacity-50" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50" />
                    </label>
                  </div>
                  {settingsData.telegram_enabled === 'true' && (
                    <div className="text-[9px] bg-bg2 border border-glass-border rounded px-2 py-1 flex items-center justify-between text-muted">
                      <span>Status: <strong className="text-green uppercase font-semibold text-[9px]">Bot Listening</strong></span>
                      <button 
                        onClick={() => setShowTgConfig(!showTgConfig)}
                        className="text-sky hover:underline font-bold uppercase tracking-wider text-[9px]"
                      >
                        {showTgConfig ? 'Close configuration' : 'Configure token'}
                      </button>
                    </div>
                  )}

                  {showTgConfig && (
                    <div className="flex flex-col gap-2.5 mt-2 pt-3 border-t border-glass-border/40 text-left">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Bot Token</label>
                        <input
                          type="text"
                          className="premium-input w-full text-xs"
                          placeholder="Telegram Bot Token"
                          value={settingsData.telegram_token || ''}
                          onChange={(e) => setSettingsData({ ...settingsData, telegram_token: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Chat ID</label>
                        <input
                          type="text"
                          className="premium-input w-full text-xs"
                          placeholder="Telegram Chat ID"
                          value={settingsData.telegram_chat_id || ''}
                          onChange={(e) => setSettingsData({ ...settingsData, telegram_chat_id: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => handleSaveConfig()}
                          className="text-[10px] font-bold bg-green/20 text-green px-3.5 py-1.5 rounded-lg hover:bg-green/35 transition-all"
                        >
                          Save Credentials
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Distributor Email Ingestion */}
                <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-text flex items-center gap-2">
                        <Mail size={14} className="text-amber" />
                        Email Invoice Ingestion
                      </h4>
                      <p className="text-[10px] text-muted leading-normal">
                        Auto-monitor linked Gmail inbox, parse purchase PDFs/CSVs, and run model training on layouts.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settingsData.automation_enabled === 'true'} 
                        onChange={() => handleToggleSetting('automation_enabled')}
                        disabled={savingSetting === 'automation_enabled'}
                      />
                      <div className="w-9 h-5 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors peer-disabled:opacity-50" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50" />
                    </label>
                  </div>
                  {settingsData.automation_enabled === 'true' && (
                    <div className="text-[9px] bg-bg2 border border-glass-border rounded px-2 py-1 flex items-center justify-between text-muted">
                      <span>Status: <strong className="text-green uppercase font-semibold text-[9px]">Gmail Scanner Active</strong></span>
                      <button 
                        onClick={() => setShowEmailConfig(!showEmailConfig)}
                        className="text-sky hover:underline font-bold uppercase tracking-wider text-[9px]"
                      >
                        {showEmailConfig ? 'Close credentials' : 'Set credentials'}
                      </button>
                    </div>
                  )}

                  {showEmailConfig && (
                    <div className="flex flex-col gap-3 mt-2 pt-3 border-t border-glass-border/40 text-left">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-wider block">Authentication Method</label>
                        <div className="flex gap-4 py-1">
                          <label className="inline-flex items-center text-[10px] text-muted cursor-pointer hover:text-text">
                            <input
                              type="radio"
                              name="gmailAuthMethod"
                              value="password"
                              checked={settingsData.gmail_auth_method === 'password'}
                              onChange={() => setSettingsData({ ...settingsData, gmail_auth_method: 'password' })}
                              className="mr-1 accent-green"
                            />
                            App Password
                          </label>
                          <label className="inline-flex items-center text-[10px] text-muted cursor-pointer hover:text-text">
                            <input
                              type="radio"
                              name="gmailAuthMethod"
                              value="oauth2"
                              checked={settingsData.gmail_auth_method === 'oauth2'}
                              onChange={() => setSettingsData({ ...settingsData, gmail_auth_method: 'oauth2' })}
                              className="mr-1 accent-green"
                            />
                            OAuth2
                          </label>
                        </div>
                      </div>

                      {settingsData.gmail_auth_method === 'password' ? (
                        <div className="grid grid-cols-1 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Gmail Login ID</label>
                            <input
                              type="email"
                              className="premium-input w-full text-xs"
                              placeholder="pharmacy@gmail.com"
                              value={settingsData.gmail_user || ''}
                              onChange={(e) => setSettingsData({ ...settingsData, gmail_user: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Gmail App Password</label>
                            <input
                              type="password"
                              className="premium-input w-full text-xs"
                              placeholder="App Password (16 chars)"
                              value={settingsData.gmail_pass || ''}
                              onChange={(e) => setSettingsData({ ...settingsData, gmail_pass: e.target.value })}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Gmail Login ID</label>
                            <input
                              type="email"
                              className="premium-input w-full text-xs"
                              placeholder="pharmacy@gmail.com"
                              value={settingsData.gmail_user || ''}
                              onChange={(e) => setSettingsData({ ...settingsData, gmail_user: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Google Client ID</label>
                            <input
                              type="text"
                              className="premium-input w-full text-xs"
                              placeholder="OAuth2 Client ID"
                              value={settingsData.google_client_id || ''}
                              onChange={(e) => setSettingsData({ ...settingsData, google_client_id: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Google Client Secret</label>
                            <input
                              type="password"
                              className="premium-input w-full text-xs"
                              placeholder="OAuth2 Client Secret"
                              value={settingsData.google_client_secret || ''}
                              onChange={(e) => setSettingsData({ ...settingsData, google_client_secret: e.target.value })}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiClient.post('/settings/save', settingsData);
                              const backendUrl = apiClient.defaults.baseURL || window.location.origin;
                              window.open(`${backendUrl}/api/email/auth/google`, '_blank');
                            }}
                            className="text-[10px] font-bold bg-primary text-text px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-all flex items-center gap-1"
                            disabled={!settingsData.google_client_id || !settingsData.google_client_secret}
                          >
                            Link Gmail Account
                          </button>
                        </div>
                      )}

                      {/* Auto delete */}
                      <div className="pt-2 border-t border-glass-border/30 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="accent-green"
                            checked={settingsData.email_autodelete_enabled !== 'false'}
                            onChange={(e) => setSettingsData({ ...settingsData, email_autodelete_enabled: e.target.checked.toString() })}
                          />
                          <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Auto-delete attachments</span>
                        </label>
                        {settingsData.email_autodelete_enabled !== 'false' && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted uppercase">Retention Count</label>
                            <input
                              type="number"
                              className="premium-input w-full text-xs"
                              placeholder="10"
                              value={settingsData.email_autodelete_limit || 10}
                              onChange={(e) => setSettingsData({ ...settingsData, email_autodelete_limit: e.target.value })}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => handleSaveConfig()}
                          className="text-[10px] font-bold bg-green/20 text-green px-3.5 py-1.5 rounded-lg hover:bg-green/35 transition-all"
                        >
                          Save Credentials
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. WhatsApp Alert Contacts */}
                <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-text flex items-center gap-2">
                        <Bell size={14} className="text-purple" />
                        WhatsApp Alert Contacts
                      </h4>
                      <p className="text-[10px] text-muted leading-normal">
                        Configure WhatsApp numbers (separated by commas for multiple recipients) for automated alerts.
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-glass-border/40 text-left">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Admin WhatsApp No(s).</label>
                      <input
                        type="text"
                        className="premium-input w-full text-xs"
                        placeholder="e.g. +919876543210, +9199..."
                        value={settingsData.admin_whatsapp || ''}
                        onChange={(e) => setSettingsData({ ...settingsData, admin_whatsapp: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Distributor WhatsApp No(s).</label>
                      <input
                        type="text"
                        className="premium-input w-full text-xs"
                        placeholder="e.g. +919876543210, +9199..."
                        value={settingsData.distributor_whatsapp || ''}
                        onChange={(e) => setSettingsData({ ...settingsData, distributor_whatsapp: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Delivery Boy WhatsApp No(s).</label>
                      <input
                        type="text"
                        className="premium-input w-full text-xs"
                        placeholder="e.g. +919876543210, +9199..."
                        value={settingsData.delivery_boy_whatsapp || ''}
                        onChange={(e) => setSettingsData({ ...settingsData, delivery_boy_whatsapp: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end mt-1">
                    <button
                      onClick={() => handleSaveConfig()}
                      className="text-[10px] font-bold bg-green/20 text-green px-3.5 py-1.5 rounded-lg hover:bg-green/35 transition-all"
                    >
                      Save Contacts
                    </button>
                  </div>
                </div>

                {/* 6. Email Alerts */}
                <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex justify-between items-start">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-text flex items-center gap-2">
                      <Mail size={14} className="text-sky" />
                      Email Alerts
                    </h4>
                    <p className="text-[10px] text-muted leading-normal">
                      Dispatch summary performance reports, low stock reports, and daily sales logs via email.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={settingsData.email_alerts === 'true'} 
                      onChange={() => handleToggleSetting('email_alerts')}
                      disabled={savingSetting === 'email_alerts'}
                    />
                    <div className="w-9 h-5 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors peer-disabled:opacity-50" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50" />
                  </label>
                </div>

                {/* 7. Pharmarack Integration Settings */}
                <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-text flex items-center gap-2 flex-wrap">
                        <Globe size={14} className="text-sky" />
                        Pharmarack Settings
                        {prHealth && (
                          <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full border leading-none ${
                            prHealth.healthy
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${prHealth.healthy ? 'bg-emerald-400' : 'bg-red-400'}`} />
                            {prHealth.mode === 'Simulation' ? 'SIMULATION' : prHealth.healthy ? 'ACTIVE' : 'EXPIRED / NOT LINKED'}
                          </span>
                        )}
                      </h4>
                      <p className="text-[10px] text-muted leading-normal">
                        Link retailer account credentials and cookies for background distributor inventory queries.
                      </p>
                    </div>
                    <button 
                      onClick={() => setShowPrConfig(!showPrConfig)}
                      className="text-[9px] font-bold text-sky hover:underline uppercase tracking-wider shrink-0 mt-0.5"
                    >
                      {showPrConfig ? 'Hide' : 'Configure'}
                    </button>
                  </div>

                  {prHealth && !prHealth.healthy && settingsData?.pharmarack_mode === 'Live' && !showPrConfig && (
                    <div className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-2.5 flex items-center justify-between animate-in fade-in slide-in-from-top-1">
                      <span>Pharmarack session is expired or not linked.</span>
                      <button
                        onClick={() => {
                          setShowPrConfig(true);
                          handleOpenLoginWindow();
                        }}
                        className="text-[9px] bg-red-500/20 hover:bg-red-500/35 border border-red-500/30 px-2 py-0.5 rounded font-black uppercase transition-all whitespace-nowrap ml-2 active:scale-95"
                      >
                        Re-link Now
                      </button>
                    </div>
                  )}
                  
                  {showPrConfig && (
                    <div className="flex flex-col gap-2.5 pt-3 border-t border-glass-border/40 text-left">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Connection Mode</label>
                        <select
                          className="premium-input w-full text-xs py-1.5"
                          value={settingsData.pharmarack_mode || 'Simulation'}
                          onChange={(e) => setSettingsData({ ...settingsData, pharmarack_mode: e.target.value })}
                        >
                          <option value="Simulation" className="bg-bg text-text">Simulation Mode</option>
                          <option value="Live" className="bg-bg text-text">Live Scraper Mode</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Username</label>
                        <input
                          type="text"
                          className="premium-input w-full text-xs"
                          placeholder="Pharmarack Mobile No"
                          value={settingsData.pharmarack_username || ''}
                          onChange={(e) => setSettingsData({ ...settingsData, pharmarack_username: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Password</label>
                        <input
                          type="password"
                          className="premium-input w-full text-xs"
                          placeholder="Password"
                          value={settingsData.pharmarack_password || ''}
                          onChange={(e) => setSettingsData({ ...settingsData, pharmarack_password: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Session Token</label>
                        <input
                          type="text"
                          className="premium-input w-full text-xs"
                          placeholder="Session Token / cookies"
                          value={settingsData.pharmarack_session_token || ''}
                          onChange={(e) => setSettingsData({ ...settingsData, pharmarack_session_token: e.target.value })}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2 mt-1">
                        <button
                          onClick={() => handleSaveConfig()}
                          className="text-[10px] font-bold bg-green/20 text-green px-3.5 py-1.5 rounded-lg hover:bg-green/35 transition-all"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleOpenLoginWindow}
                          disabled={isOpeningWindow}
                          className="text-[10px] font-bold bg-sky-500/20 text-sky px-3 py-1.5 rounded-lg hover:bg-sky-500/30 transition-all flex items-center gap-1 disabled:opacity-50"
                        >
                          <LogIn size={10} />
                          {isOpeningWindow ? 'Opening...' : 'Chrome Login'}
                        </button>
                        <button
                          onClick={handlePharmarackLogout}
                          className="text-[10px] font-bold bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-all flex items-center gap-1"
                        >
                          <LogOut size={10} /> Log Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted flex flex-col items-center justify-center gap-2">
                <span>Failed to retrieve configuration settings.</span>
                <button
                  onClick={fetchSettings}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-glass-border text-muted hover:text-text transition-all font-semibold flex items-center gap-1 active:scale-95"
                >
                  <RefreshCw size={12} />
                  Retry Loading
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Distributors List */}
        <div className={`${hasSelected ? 'lg:col-span-3' : 'lg:col-span-6'} bg-glass-bg border border-glass-border rounded-2xl p-5 flex flex-col h-full overflow-hidden transition-all duration-300`}>
          <div className="flex justify-between items-center border-b border-glass-border pb-3 shrink-0">
            <h3 className="text-sm font-bold text-text uppercase tracking-widest flex items-center gap-2">
              <Database size={16} className="text-sky" />
              Distributors ({profiles.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddDistModal(true)}
                className="p-1 text-muted hover:text-sky transition-all flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider"
                title="Add Distributor"
              >
                <Plus size={12} /> Add
              </button>
              <span className="text-muted/30">|</span>
              <button
                onClick={fetchProfiles}
                disabled={loadingProfiles}
                className="p-1 text-muted hover:text-sky transition-all disabled:opacity-50"
                title="Sync Profiles"
              >
                <RefreshCw size={14} className={loadingProfiles ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto py-2 space-y-2 pr-1 custom-scrollbar">
            {loadingProfiles && profiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted gap-2">
                <RefreshCw className="animate-spin text-sky" size={20} />
                <span className="text-xs">Loading profiles...</span>
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-20 text-xs text-muted">No distributors found.</div>
            ) : (
              <div className="space-y-2">
                {profiles.map(p => {
                  const isSelected = selectedProfileId === p.distributor_id;
                  return (
                    <button
                      key={p.distributor_id}
                      onClick={() => fetchProfileDetail(p.distributor_id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-1.5 ${
                        isSelected 
                          ? 'bg-sky-500/10 border-sky-500/30 text-text shadow-lg' 
                          : 'bg-bg3 border-glass-border hover:bg-bg2 text-muted hover:text-text'
                      }`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <span className="font-bold text-xs truncate max-w-[70%]">{p.distributor_name}</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${
                          p.files_count > 0 
                            ? 'bg-green/10 text-green border border-green/20' 
                            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                        }`}>
                          {p.files_count > 0 ? `${p.files_count} ref` : 'no data'}
                        </span>
                      </div>
                      {p.distributor_email && (
                        <span className="text-[9px] text-muted/80 font-mono truncate w-full">{p.distributor_email}</span>
                      )}
                      <div className="flex justify-between items-center w-full mt-1 pt-1.5 border-t border-glass-border/30 text-[9px] text-muted/65">
                        <span>Updated: {p.last_updated ? new Date(p.last_updated).toLocaleDateString() : 'Never'}</span>
                        {p.last_status && (
                          <span className={`font-semibold uppercase ${p.last_status === 'success' ? 'text-green' : 'text-red-400'}`}>
                            {p.last_status}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Profile Details & Rules Editor */}
        {hasSelected && (
          <div className="lg:col-span-5 bg-glass-bg border border-glass-border rounded-2xl p-5 flex flex-col h-full overflow-hidden transition-all duration-300">
            {loadingDetail ? (
              <div className="flex-1 text-center text-muted flex flex-col items-center justify-center gap-4 p-8">
                <RefreshCw className="animate-spin text-sky" size={28} />
                <span className="text-xs">Fetching supplier profile details...</span>
              </div>
            ) : selectedProfile ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0 space-y-4">
                
                {/* Profile Config Header */}
                <div className="border-b border-glass-border pb-3 flex justify-between items-start shrink-0">
                  <div>
                    <h2 className="text-sm font-bold text-text">{selectedProfile.distributor.name}</h2>
                    <p className="text-[10px] text-muted">Active layout configuration rules & training model</p>
                  </div>
                  <button
                    onClick={resetProfile}
                    className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 text-red-400 hover:text-red-300 rounded-lg text-[10px] font-bold uppercase transition-all"
                  >
                    Reset Profile
                  </button>
                </div>

              {/* Scrollable Form & References */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                
                {/* Distributor Profile Details (Name, Phone, Email) */}
                <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex flex-col gap-3">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-sky flex items-center gap-1.5 border-b border-glass-border/40 pb-1.5">
                    <Database size={12} />
                    Distributor Contact Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Name</label>
                      <input
                        type="text"
                        className="premium-input w-full text-xs"
                        value={selectedProfile.distributor.name || ''}
                        onChange={(e) => {
                          setSelectedProfile({
                            ...selectedProfile,
                            distributor: { ...selectedProfile.distributor, name: e.target.value }
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-wider">WhatsApp Phone</label>
                      <input
                        type="text"
                        className="premium-input w-full text-xs"
                        placeholder="e.g. +919876543210"
                        value={selectedProfile.distributor.phone || ''}
                        onChange={(e) => {
                          setSelectedProfile({
                            ...selectedProfile,
                            distributor: { ...selectedProfile.distributor, phone: e.target.value }
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Email Address</label>
                      <input
                        type="text"
                        className="premium-input w-full text-xs"
                        placeholder="e.g. supplier@gmail.com"
                        value={selectedProfile.distributor.email || ''}
                        onChange={(e) => {
                          setSelectedProfile({
                            ...selectedProfile,
                            distributor: { ...selectedProfile.distributor, email: e.target.value }
                          });
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <div className="text-[9px] text-muted">
                      ID: {selectedProfile.distributor.id} | References: {selectedProfile.files.length}
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await apiClient.put(`/settings/distributors/${selectedProfile.distributor.id}`, selectedProfile.distributor);
                          toastEvent.trigger('Distributor details updated successfully', 'success');
                          fetchProfiles();
                        } catch (err) {
                          console.error('Failed to update distributor details', err);
                          toastEvent.trigger('Failed to update distributor details', 'error');
                        }
                      }}
                      className="text-[10px] font-bold bg-green/20 text-green px-3.5 py-1.5 rounded-lg hover:bg-green/35 transition-all"
                    >
                      Update Details
                    </button>
                  </div>
                </div>
                
                {/* Column Mappings Form */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-sky flex items-center gap-1.5 border-b border-glass-border/40 pb-1.5">
                    <Settings size={12} />
                    Field Column Maps (Raw Header Match Key)
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {Object.keys(mappingRules).map(field => {
                      const label = field.replace(/_/g, ' ').toUpperCase();
                      return (
                        <div key={field} className="space-y-1">
                          <label className="block text-[10px] font-bold text-text tracking-wider uppercase">
                            {label}
                          </label>
                          <input
                            type="text"
                            value={mappingRules[field]}
                            onChange={(e) => setMappingRules({ ...mappingRules, [field]: e.target.value })}
                            placeholder={`e.g. ${field === 'name' ? 'item_name' : field}`}
                            className="w-full bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-text text-xs focus:outline-none focus:border-sky-500/50"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={saveMapping}
                      disabled={savingMapping}
                      className="px-4 py-2 bg-green hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      {savingMapping ? 'Saving...' : 'Save Column Map'}
                    </button>
                  </div>
                </div>

                {/* Historical Reference Files */}
                <div className="space-y-3 pt-2">
                  <div className="border-b border-glass-border/45 pb-1.5">
                    <h3 className="text-[11px] font-bold text-text uppercase tracking-wider flex items-center gap-2">
                      <FileText size={14} className="text-sky" />
                      Reference Historical Files Memory (Last 5)
                    </h3>
                    <p className="text-[10px] text-muted leading-relaxed mt-0.5">
                      System chooses the closest matching layout by calculating Jaccard similarity metrics.
                    </p>
                  </div>

                  {selectedProfile.files.length === 0 ? (
                    <p className="text-[10px] text-muted text-center py-4 italic bg-bg3 rounded-lg border border-glass-border">No historical data recorded for this supplier yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedProfile.files.map(file => (
                        <div 
                          key={file.id} 
                          className="bg-bg3 border border-glass-border rounded-xl p-3 flex justify-between items-center transition-all hover:bg-bg2/40"
                        >
                          <div className="space-y-1 min-w-0 flex-1 mr-3">
                            <p className="text-[11px] font-bold text-text font-mono truncate">
                              {file.filename}
                            </p>
                            <div className="flex gap-2 text-[9px] text-muted">
                              <span className="uppercase font-semibold text-sky">{file.file_type}</span>
                              <span>·</span>
                              <span>{new Date(file.created_at).toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => loadComparator(file.id)}
                              className="px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky hover:text-sky-300 rounded-lg text-[9px] font-bold uppercase transition-all"
                            >
                              Compare
                            </button>
                            <button
                              onClick={() => deleteHistoricalFile(file.id)}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-all"
                              title="Delete file reference"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : null}
        </div>
      )}
      </div>

      {/* Side-by-Side Comparator Modal */}
      {comparatorFileId && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-bg border border-glass-border rounded-2xl w-11/12 max-w-5xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border bg-bg3/50">
              <div>
                <h3 className="text-base font-bold text-text">Split-Screen Layout Comparator</h3>
                <p className="text-xs text-muted">Comparing raw file columns vs parsed database structure</p>
              </div>
              <button 
                onClick={() => { setComparatorFileId(null); setComparatorData(null); }}
                className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-white/5 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            {loadingComparator ? (
              <div className="flex-1 flex flex-col items-center justify-center py-24 text-muted gap-2">
                <RefreshCw className="animate-spin text-sky" size={28} />
                <span>Loading reference file data...</span>
              </div>
            ) : comparatorData ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Meta details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-bg3 p-4 rounded-xl border border-glass-border">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted font-bold uppercase tracking-wider block">File Name</span>
                    <span className="text-xs text-text font-mono break-all">{comparatorData.filename}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted font-bold uppercase tracking-wider block">Layout Type</span>
                    <span className="text-xs text-text uppercase font-black tracking-wide">{comparatorData.file_type}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted font-bold uppercase tracking-wider block font-bold text-green flex items-center gap-1">
                      <CheckCircle2 size={12} /> Extraction Status
                    </span>
                    <span className="text-xs text-green font-bold uppercase">{comparatorData.status}</span>
                  </div>
                </div>

                {/* Headers Map Comparator */}
                {comparatorData.file_type === 'csv' || comparatorData.file_type === 'xlsx' || comparatorData.file_type === 'xls' ? (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-sky flex items-center gap-1.5">
                      <Settings size={14} />
                      Header Alignment Mapping Config
                    </h4>
                    
                    <div className="bg-bg3 border border-glass-border rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-bg/95 border-b border-glass-border text-[10px] font-bold text-muted uppercase tracking-widest">
                            <th className="py-2.5 px-4">System Database Property</th>
                            <th className="py-2.5 px-4 flex items-center gap-1">
                              Raw Document Header Key <ArrowRight size={10} className="text-sky" />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(comparatorData.mapping_config).map(([dbProp, fileHeader]) => (
                            <tr key={dbProp} className="border-b border-glass-border/40 hover:bg-bg2/40">
                              <td className="py-2.5 px-4 font-mono text-xs text-text font-semibold">{dbProp}</td>
                              <td className="py-2.5 px-4 text-xs">
                                {fileHeader ? (
                                  <span className="font-mono text-sky font-bold bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded">
                                    {fileHeader}
                                  </span>
                                ) : (
                                  <span className="text-yellow-500/70 italic flex items-center gap-1 font-bold text-[10px]">
                                    <AlertTriangle size={12} />
                                    No Map
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {/* Extracted Items Comparison Table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-sky flex items-center gap-1.5">
                    <FileText size={14} />
                    Extracted Records Preview ({comparatorData.extracted_data.length})
                  </h4>

                  <div className="bg-bg3 border border-glass-border rounded-xl overflow-hidden overflow-x-auto max-h-[30vh]">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="bg-bg/95 border-b border-glass-border text-[10px] font-bold text-muted uppercase tracking-widest">
                          <th className="py-2.5 px-4">Medicine Name</th>
                          <th className="py-2.5 px-4">Batch No</th>
                          <th className="py-2.5 px-4">Expiry</th>
                          <th className="py-2.5 px-4 text-right">Rate</th>
                          <th className="py-2.5 px-4 text-right">MRP</th>
                          <th className="py-2.5 px-4 text-right">Qty</th>
                          <th className="py-2.5 px-4 text-right">Free</th>
                          <th className="py-2.5 px-4 text-right">CGST%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparatorData.extracted_data.map((item, idx) => (
                          <tr key={idx} className="border-b border-glass-border/40 hover:bg-bg2/40 text-xs">
                            <td className="py-2.5 px-4 text-text font-medium truncate max-w-[200px]" title={item.name}>
                              {item.name}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-text">{item.batch_no || 'N/A'}</td>
                            <td className="py-2.5 px-4 font-mono text-text">{item.expiry_date || 'N/A'}</td>
                            <td className="py-2.5 px-4 text-right text-green-400 font-semibold font-mono">
                              ₹{typeof item.rate === 'number' ? item.rate.toFixed(2) : (typeof item.price === 'number' ? item.price.toFixed(2) : '0.00')}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono">₹{typeof item.mrp === 'number' ? item.mrp.toFixed(2) : '0.00'}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-text">{item.quantity || item.qty || 0}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-muted">{item.free_qty || 0}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-orange-400">{item.cgst_per || 0}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 py-16 text-center text-muted">Failed to load comparator data.</div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end px-6 py-4 border-t border-glass-border bg-bg3/50">
              <button
                onClick={() => { setComparatorFileId(null); setComparatorData(null); }}
                className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold uppercase transition-all"
              >
                Close Comparator
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Distributor Modal */}
      {showAddDistModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md border-primary/20 p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-glass-border pb-2.5">
              <h3 className="font-bold text-sm text-text flex items-center gap-2">
                <Database size={16} className="text-sky" />
                Add New Distributor
              </h3>
              <button
                onClick={() => setShowAddDistModal(false)}
                className="p-1 rounded hover:bg-white/10 text-muted hover:text-text transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3.5 py-1 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Name *</label>
                <input
                  type="text"
                  className="premium-input w-full text-xs"
                  placeholder="Distributor / Supplier Name"
                  value={newDistName}
                  onChange={(e) => setNewDistName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted uppercase tracking-wider">WhatsApp Phone No.</label>
                <input
                  type="text"
                  className="premium-input w-full text-xs"
                  placeholder="e.g. +919876543210"
                  value={newDistPhone}
                  onChange={(e) => setNewDistPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Email Address</label>
                <input
                  type="text"
                  className="premium-input w-full text-xs"
                  placeholder="e.g. distributor@gmail.com"
                  value={newDistEmail}
                  onChange={(e) => setNewDistEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowAddDistModal(false)}
                className="px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-glass-border text-muted hover:text-text text-xs font-bold transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDistributor}
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md shadow-sky-500/10"
              >
                Add Distributor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Learning;
