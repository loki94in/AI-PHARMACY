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
  Bell
} from 'lucide-react';
import { apiClient } from '../services/api';
import { toastEvent } from '../services/events';

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
    fetchSettings();
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
            <p className="text-xs text-muted leading-relaxed mb-4">
              Toggle and monitor intelligent background services, automated integrations, and real-time communication modules.
            </p>
            
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
                      <a href="/settings" className="text-sky hover:underline font-bold uppercase tracking-wider text-[9px]">Configure session</a>
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
                      <a href="/settings" className="text-sky hover:underline font-bold uppercase tracking-wider text-[9px]">Settings</a>
                    </div>
                  )}
                </div>

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
                      <a href="/settings" className="text-sky hover:underline font-bold uppercase tracking-wider text-[9px]">Configure token</a>
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
                      <a href="/settings" className="text-sky hover:underline font-bold uppercase tracking-wider text-[9px]">Set credentials</a>
                    </div>
                  )}
                </div>

                {/* 5. General WhatsApp Alerts */}
                <div className="bg-bg3 border border-glass-border rounded-xl p-4 flex justify-between items-start">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-text flex items-center gap-2">
                      <Bell size={14} className="text-purple" />
                      WhatsApp Stock Alerts
                    </h4>
                    <p className="text-[10px] text-muted leading-normal">
                      Dispatch low-stock notifications and supplier alerts automatically to key store personnel.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={settingsData.whatsapp_notif === 'true'} 
                      onChange={() => handleToggleSetting('whatsapp_notif')}
                      disabled={savingSetting === 'whatsapp_notif'}
                    />
                    <div className="w-9 h-5 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors peer-disabled:opacity-50" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50" />
                  </label>
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
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted">Failed to retrieve configuration settings.</div>
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
            <button
              onClick={fetchProfiles}
              disabled={loadingProfiles}
              className="p-1 text-muted hover:text-sky transition-all disabled:opacity-50"
              title="Sync Profiles"
            >
              <RefreshCw size={14} className={loadingProfiles ? 'animate-spin' : ''} />
            </button>
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
    </div>
  );
};

export default Learning;
