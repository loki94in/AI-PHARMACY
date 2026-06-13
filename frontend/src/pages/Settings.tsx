import { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import {
  Settings as SettingsIcon,
  Building2,
  Receipt,
  Bell,
  Database,
  Trash2,
  HardDrive,
  Save,
  MessageCircle,
  Send,
  RefreshCw,
  Zap,
  CheckCircle2,
  XCircle,
  Globe,
  Copy,
  Mail,
  LogIn,
  LogOut,
} from 'lucide-react';
import { toastEvent } from '../services/events';

const Settings = () => {
  // Pharmacy Details
  const [pharmacyName, setPharmacyName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [drugLicense, setDrugLicense] = useState('');
  const [email, setEmail] = useState('');
  const [gmailUser, setGmailUser] = useState('');
  const [gmailPass, setGmailPass] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [gmailAuthMethod, setGmailAuthMethod] = useState('password');
  const [emailAutodeleteEnabled, setEmailAutodeleteEnabled] = useState(true);
  const [emailAutodeleteLimit, setEmailAutodeleteLimit] = useState<number>(10);
  const [automationEnabled, setAutomationEnabled] = useState(false);

  // Pharmarack Settings state
  const [prUsername, setPrUsername] = useState('');
  const [prPassword, setPrPassword] = useState('');
  const [prToken, setPrToken] = useState('');
  const [prMode, setPrMode] = useState('Simulation');
  const [isOpeningWindow, setIsOpeningWindow] = useState(false);
  const [isOpeningWaWindow, setIsOpeningWaWindow] = useState(false);


  // Billing Preferences
  const [defaultTaxRate, setDefaultTaxRate] = useState<number>(18);
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');
  const [autoPrint, setAutoPrint] = useState(false);
  const [defaultPaymentMode, setDefaultPaymentMode] = useState('Cash');

  // Notifications
  const [whatsappNotif, setWhatsappNotif] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(10);
  const [expiryAlertDays, setExpiryAlertDays] = useState<number>(90);

  // Messaging Integrations
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [waStatus, setWaStatus] = useState({ isReady: false, qrUrl: null as string | null, message: '' });

  // WhatsApp Business API
  const [waBusinessEnabled, setWaBusinessEnabled] = useState(false);
  const [waBusinessPhoneNumberId, setWaBusinessPhoneNumberId] = useState('');
  const [waBusinessAccessToken, setWaBusinessAccessToken] = useState('');
  const [waBusinessWabaId, setWaBusinessWabaId] = useState('');
  const [waBusinessWebhookVerifyToken, setWaBusinessWebhookVerifyToken] = useState('');
  const [waBusinessTestResult, setWaBusinessTestResult] = useState<{ success?: boolean; phone?: string; name?: string; error?: string } | null>(null);
  const [waBusinessTesting, setWaBusinessTesting] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await apiClient.get('/settings');
        if (data) {
          setPharmacyName(data.shop_name || '');
          setAddress(data.shop_address || '');
          setPhone(data.shop_phone || '');
          setGstin(data.gstin || '');
          setDrugLicense(data.shop_licence || '');
          setEmail(data.email || '');
          
          setGmailUser(data.gmail_user || '');
          setGmailPass(data.gmail_pass || '');
          setGoogleClientId(data.google_client_id || '');
          setGoogleClientSecret(data.google_client_secret || '');
          setGmailAuthMethod(data.gmail_auth_method || 'password');
          setEmailAutodeleteEnabled(data.email_autodelete_enabled !== 'false');
          setEmailAutodeleteLimit(Number(data.email_autodelete_limit) || 10);
          setAutomationEnabled(data.automation_enabled === 'true');


          setDefaultTaxRate(Number(data.default_tax_rate) || 18);
          setInvoicePrefix(data.invoice_prefix || 'INV-');
          setAutoPrint(data.auto_print === 'true');
          setDefaultPaymentMode(data.default_payment_mode || 'Cash');

          setWhatsappNotif(data.whatsapp_notif === 'true');
          setEmailAlerts(data.email_alerts === 'true');
          setLowStockThreshold(Number(data.low_stock_threshold) || 10);
          setExpiryAlertDays(Number(data.expiry_alert_days) || 90);

          setTelegramEnabled(data.telegram_enabled === 'true');
          setTelegramToken(data.telegram_token || '');
          setTelegramChatId(data.telegram_chat_id || '');
          
          setWhatsappEnabled(data.whatsapp_enabled === 'true');

           // WhatsApp Business API
          setWaBusinessEnabled(data.wa_business_enabled === 'true');
          setWaBusinessPhoneNumberId(data.wa_business_phone_number_id || '');
          setWaBusinessAccessToken(data.wa_business_access_token || '');
          setWaBusinessWabaId(data.wa_business_waba_id || '');
          setWaBusinessWebhookVerifyToken(data.wa_business_webhook_verify_token || '');

          // Pharmarack Settings
          setPrUsername(data.pharmarack_username || '');
          setPrPassword(data.pharmarack_password || '');
          setPrToken(data.pharmarack_session_token || '');
          setPrMode(data.pharmarack_mode || 'Simulation');
        }
      } catch (error) {
        console.error('Failed to load settings', error);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    let timer: any;
    if (whatsappEnabled && !waStatus.isReady) {
      const fetchQR = async () => {
        try {
          const { data } = await apiClient.get('/messaging/qr');
          setWaStatus(data);
        } catch (error) {
          console.error("Failed to fetch WhatsApp QR", error);
        }
      };
      fetchQR(); // Initial fetch
      timer = setInterval(fetchQR, 5000); // Poll every 5s
    }
    return () => clearInterval(timer);
  }, [whatsappEnabled, waStatus.isReady]);

  const handleSaveSettings = async () => {
    const payload = {
      shop_name: pharmacyName,
      shop_address: address,
      shop_phone: phone,
      gstin: gstin,
      shop_licence: drugLicense,
      email: email,
      
      gmail_user: gmailUser,
      gmail_pass: gmailPass,
      google_client_id: googleClientId,
      google_client_secret: googleClientSecret,
      gmail_auth_method: gmailAuthMethod,
      email_autodelete_enabled: emailAutodeleteEnabled.toString(),
      email_autodelete_limit: emailAutodeleteLimit.toString(),
      automation_enabled: automationEnabled.toString(),


      default_tax_rate: defaultTaxRate.toString(),
      invoice_prefix: invoicePrefix,
      auto_print: autoPrint.toString(),
      default_payment_mode: defaultPaymentMode,

      whatsapp_notif: whatsappNotif.toString(),
      email_alerts: emailAlerts.toString(),
      low_stock_threshold: lowStockThreshold.toString(),
      expiry_alert_days: expiryAlertDays.toString(),

      telegram_enabled: telegramEnabled.toString(),
      telegram_token: telegramToken,
      telegram_chat_id: telegramChatId,
      
      whatsapp_enabled: whatsappEnabled.toString(),

       // WhatsApp Business API
      wa_business_enabled: waBusinessEnabled.toString(),
      wa_business_phone_number_id: waBusinessPhoneNumberId,
      wa_business_access_token: waBusinessAccessToken,
      wa_business_waba_id: waBusinessWabaId,
      wa_business_webhook_verify_token: waBusinessWebhookVerifyToken,

      // Pharmarack Settings
      pharmarack_username: prUsername,
      pharmarack_password: prPassword,
      pharmarack_session_token: prToken,
      pharmarack_mode: prMode,
    };

    try {
      await apiClient.post('/settings/save', payload);
      toastEvent.trigger('Settings saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save settings', error);
      toastEvent.trigger('Failed to save settings', 'error');
    }
  };

  const handleOpenLoginWindow = async () => {
    setIsOpeningWindow(true);
    setPrToken('');
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
          if (data && data.pharmarack_session_token && data.pharmarack_session_token !== prToken) {
            setPrToken(data.pharmarack_session_token);
            setPrMode(data.pharmarack_mode || 'Live');
            toastEvent.trigger('Successfully linked Pharmarack session!', 'success');
            clearInterval(interval);
            setIsOpeningWindow(false);
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
    setPrUsername('');
    setPrPassword('');
    setPrToken('');
    setPrMode('Simulation');
    
    const payload = {
      shop_name: pharmacyName,
      shop_address: address,
      shop_phone: phone,
      gstin: gstin,
      shop_licence: drugLicense,
      email: email,
      
      gmail_user: gmailUser,
      gmail_pass: gmailPass,
      google_client_id: googleClientId,
      google_client_secret: googleClientSecret,
      gmail_auth_method: gmailAuthMethod,
      email_autodelete_enabled: emailAutodeleteEnabled.toString(),
      email_autodelete_limit: emailAutodeleteLimit.toString(),
      automation_enabled: automationEnabled.toString(),

      default_tax_rate: defaultTaxRate.toString(),
      invoice_prefix: invoicePrefix,
      auto_print: autoPrint.toString(),
      default_payment_mode: defaultPaymentMode,

      whatsapp_notif: whatsappNotif.toString(),
      email_alerts: emailAlerts.toString(),
      low_stock_threshold: lowStockThreshold.toString(),
      expiry_alert_days: expiryAlertDays.toString(),

      telegram_enabled: telegramEnabled.toString(),
      telegram_token: telegramToken,
      telegram_chat_id: telegramChatId,
      
      whatsapp_enabled: whatsappEnabled.toString(),

      wa_business_enabled: waBusinessEnabled.toString(),
      wa_business_phone_number_id: waBusinessPhoneNumberId,
      wa_business_access_token: waBusinessAccessToken,
      wa_business_waba_id: waBusinessWabaId,
      wa_business_webhook_verify_token: waBusinessWebhookVerifyToken,

      pharmarack_username: '',
      pharmarack_password: '',
      pharmarack_session_token: '',
      pharmarack_mode: 'Simulation'
    };

    try {
      await apiClient.post('/settings/save', payload);
      toastEvent.trigger('Logged out and cleared Pharmarack credentials successfully.', 'success');
    } catch (error) {
      console.error('Failed to logout from Pharmarack', error);
      toastEvent.trigger('Failed to logout from Pharmarack', 'error');
    }
  };

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
      // Save credentials first so the test endpoint can read them
      await handleSaveSettings();
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

  return (
    <div className="h-full flex flex-col fade-in space-y-6 overflow-y-auto pb-8">

      {/* ─── Pharmacy Details ─── */}
      <div className="glass-panel p-6">
        <h3 className="font-bold flex items-center gap-2 mb-6">
          <Building2 size={18} className="text-sky" />
          Pharmacy Details
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-2">
            <label htmlFor="pharmacyName" className="text-xs font-bold text-muted uppercase tracking-wider">
              Pharmacy Name
            </label>
            <input
              id="pharmacyName"
              type="text"
              className="premium-input w-full"
              placeholder="e.g. MedPlus Pharmacy"
              value={pharmacyName}
              onChange={(e) => setPharmacyName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="address" className="text-xs font-bold text-muted uppercase tracking-wider">
              Address
            </label>
            <input
              id="address"
              type="text"
              className="premium-input w-full"
              placeholder="Street, City, State"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="phone" className="text-xs font-bold text-muted uppercase tracking-wider">
              Phone
            </label>
            <input
              id="phone"
              type="text"
              className="premium-input w-full"
              placeholder="10-digit number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="gstin" className="text-xs font-bold text-muted uppercase tracking-wider">
              GSTIN
            </label>
            <input
              id="gstin"
              type="text"
              className="premium-input w-full"
              placeholder="22AAAAA0000A1Z5"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="drugLicense" className="text-xs font-bold text-muted uppercase tracking-wider">
              Drug License No.
            </label>
            <input
              id="drugLicense"
              type="text"
              className="premium-input w-full"
              placeholder="DL-0000-000000"
              value={drugLicense}
              onChange={(e) => setDrugLicense(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-xs font-bold text-muted uppercase tracking-wider">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="premium-input w-full"
              placeholder="pharmacy@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button 
            onClick={handleSaveSettings}
            className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600 flex items-center gap-2"
          >
            <Save size={16} />
            Save Details
          </button>
        </div>
      </div>

      {/* ─── Billing Preferences ─── */}
      <div className="glass-panel p-6">
        <h3 className="font-bold flex items-center gap-2 mb-6">
          <Receipt size={18} className="text-amber" />
          Billing Preferences
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-2">
            <label htmlFor="defaultTaxRate" className="text-xs font-bold text-muted uppercase tracking-wider">
              Default Tax Rate %
            </label>
            <input
              id="defaultTaxRate"
              type="number"
              min={0}
              max={100}
              className="premium-input w-full"
              placeholder="18"
              value={defaultTaxRate}
              onChange={(e) => setDefaultTaxRate(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="invoicePrefix" className="text-xs font-bold text-muted uppercase tracking-wider">
              Invoice Prefix
            </label>
            <input
              id="invoicePrefix"
              type="text"
              className="premium-input w-full"
              placeholder="INV-"
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="defaultPaymentMode" className="text-xs font-bold text-muted uppercase tracking-wider">
              Default Payment Mode
            </label>
            <select
              id="defaultPaymentMode"
              className="premium-input w-full"
              value={defaultPaymentMode}
              onChange={(e) => setDefaultPaymentMode(e.target.value)}
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="Credit">Credit</option>
            </select>
          </div>

          <div className="space-y-2 flex items-end">
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={autoPrint}
                  onChange={(e) => setAutoPrint(e.target.checked)}
                  aria-label="Enable Auto-Print"
                />
                <div className="w-11 h-6 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
              </div>
              <span className="text-sm font-semibold group-hover:text-white transition-colors">
                Enable Auto-Print
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* ─── Notifications ─── */}
      <div className="glass-panel p-6">
        <h3 className="font-bold flex items-center gap-2 mb-6">
          <Bell size={18} className="text-primary" />
          Notifications
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <div className="space-y-2 flex items-end">
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={whatsappNotif}
                  onChange={(e) => setWhatsappNotif(e.target.checked)}
                  aria-label="Enable WhatsApp Notifications"
                />
                <div className="w-11 h-6 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
              </div>
              <span className="text-sm font-semibold group-hover:text-white transition-colors">
                Enable WhatsApp Notifications
              </span>
            </label>
          </div>

          <div className="space-y-2 flex items-end">
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={emailAlerts}
                  onChange={(e) => setEmailAlerts(e.target.checked)}
                  aria-label="Enable Email Alerts"
                />
                <div className="w-11 h-6 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
              </div>
              <span className="text-sm font-semibold group-hover:text-white transition-colors">
                Enable Email Alerts
              </span>
            </label>
          </div>



          <div className="space-y-2">
            <label htmlFor="lowStockThreshold" className="text-xs font-bold text-muted uppercase tracking-wider">
              Low Stock Threshold
            </label>
            <input
              id="lowStockThreshold"
              type="number"
              min={0}
              className="premium-input w-full"
              placeholder="10"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="expiryAlertDays" className="text-xs font-bold text-muted uppercase tracking-wider">
              Expiry Alert Days
            </label>
            <input
              id="expiryAlertDays"
              type="number"
              min={0}
              className="premium-input w-full"
              placeholder="90"
              value={expiryAlertDays}
              onChange={(e) => setExpiryAlertDays(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button 
            onClick={handleSaveSettings}
            className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600 flex items-center gap-2"
          >
            <Save size={16} />
            Save Preferences
          </button>
        </div>
      </div>

      {/* ─── Messaging Integrations ─── */}
      <div className="glass-panel p-6">
        <h3 className="font-bold flex items-center gap-2 mb-6">
          <MessageCircle size={18} className="text-emerald-400" />
          Messaging Integrations
        </h3>

        {/* Telegram Config */}
        <div className="border border-glass-border/40 p-5 rounded-xl bg-white/5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold flex items-center gap-2 text-sky">
              <Send size={16} /> Telegram Bot
            </h4>
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                />
                <div className="w-10 h-5 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
              </div>
              <span className="text-sm font-semibold group-hover:text-white transition-colors">
                {telegramEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
          
          {telegramEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-2 border-t border-glass-border/30">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Bot Token</label>
                <input
                  type="text"
                  className="premium-input w-full"
                  placeholder="e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Chat ID</label>
                <input
                  type="text"
                  className="premium-input w-full"
                  placeholder="e.g. -100123456789"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* WhatsApp Config */}
        <div className="border border-glass-border/40 p-5 rounded-xl bg-white/5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold flex items-center gap-2 text-emerald-400">
              <MessageCircle size={16} /> WhatsApp Web
            </h4>
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                />
                <div className="w-10 h-5 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
              </div>
              <span className="text-sm font-semibold group-hover:text-white transition-colors">
                {whatsappEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
          
          {whatsappEnabled && (
            <div className="flex items-center justify-center p-6 border-2 border-dashed border-glass-border/30 rounded-xl bg-black/20 mt-2">
              <div className="text-center space-y-3">
                <div className="w-40 h-40 mx-auto bg-white rounded-xl flex items-center justify-center p-3 shadow-inner">
                  {waStatus.isReady ? (
                    <div className="flex flex-col items-center justify-center w-full h-full text-green">
                      <MessageCircle size={48} className="mb-2" />
                      <span className="font-bold text-sm">Connected!</span>
                    </div>
                  ) : waStatus.qrUrl ? (
                    <img src={waStatus.qrUrl} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
                  ) : (
                    <div className="animate-pulse flex flex-col items-center justify-center w-full h-full">
                      <div className="w-8 h-8 border-4 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin mb-3"></div>
                      <span className="text-[10px] text-muted font-bold text-center">Loading QR...<br/>Check terminal</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted max-w-xs mx-auto">
                  {waStatus.isReady 
                    ? "Your WhatsApp account is successfully linked and active."
                    : waStatus.message || "Scan this QR code with your WhatsApp app to link your account."}
                </p>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {!waStatus.isReady && (
                    <>
                      <button 
                        onClick={handleOpenWaLoginWindow}
                        disabled={isOpeningWaWindow}
                        className="text-xs font-bold bg-green/20 text-green px-4 py-1.5 rounded-full hover:bg-green/30 transition-all flex items-center gap-1 disabled:opacity-50"
                        title="Open Chrome to log in to WhatsApp Web"
                      >
                        <LogIn size={12} />
                        {isOpeningWaWindow ? 'Opening...' : 'Log In (Chrome Popup)'}
                      </button>
                      <button 
                        onClick={() => setWaStatus({ ...waStatus, qrUrl: null })}
                        className="text-xs font-bold bg-primary/20 text-primary px-4 py-1.5 rounded-full hover:bg-primary/30 transition-all"
                      >
                        Refresh Status
                      </button>
                    </>
                  )}
                  <button 
                    onClick={handleReconnect}
                    className="text-xs font-bold bg-red/20 text-red px-4 py-1.5 rounded-full hover:bg-red/30 transition-all flex items-center gap-1"
                    title="Log out and clear WhatsApp session"
                  >
                    <LogOut size={12} /> Log Out WhatsApp
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* WhatsApp Business API (Official) Config */}
        <div className="border border-glass-border/40 p-5 rounded-xl bg-white/5 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold flex items-center gap-2 text-green">
              <Zap size={16} /> WhatsApp Business API (Official)
            </h4>
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={waBusinessEnabled}
                  onChange={(e) => setWaBusinessEnabled(e.target.checked)}
                />
                <div className="w-10 h-5 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
              </div>
              <span className="text-sm font-semibold group-hover:text-white transition-colors">
                {waBusinessEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>

          {waBusinessEnabled && (
            <div className="pt-2 border-t border-glass-border/30 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">Phone Number ID</label>
                  <input
                    type="text"
                    className="premium-input w-full"
                    placeholder="e.g. 123456789012345"
                    value={waBusinessPhoneNumberId}
                    onChange={(e) => setWaBusinessPhoneNumberId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">Access Token</label>
                  <input
                    type="password"
                    className="premium-input w-full"
                    placeholder="EAAxxxxxxx..."
                    value={waBusinessAccessToken}
                    onChange={(e) => setWaBusinessAccessToken(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">WhatsApp Business Account ID</label>
                  <input
                    type="text"
                    className="premium-input w-full"
                    placeholder="e.g. 109876543210"
                    value={waBusinessWabaId}
                    onChange={(e) => setWaBusinessWabaId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">Webhook Verify Token</label>
                  <input
                    type="text"
                    className="premium-input w-full"
                    placeholder="Any secret phrase you choose"
                    value={waBusinessWebhookVerifyToken}
                    onChange={(e) => setWaBusinessWebhookVerifyToken(e.target.value)}
                  />
                </div>
              </div>

              {/* Webhook URL display */}
              <div className="glass-panel p-3 flex items-center justify-between bg-black/20 border border-glass-border/30 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe size={14} className="text-sky flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted uppercase font-bold tracking-wider">Webhook URL (register in Meta Developer Console)</p>
                    <p className="text-xs text-sky font-mono truncate">{window.location.origin}/api/wa-business/webhook</p>
                  </div>
                </div>
                <button
                  onClick={copyWebhookUrl}
                  className="text-xs font-bold bg-sky/20 text-sky px-3 py-1.5 rounded-full hover:bg-sky/30 transition-all flex items-center gap-1 flex-shrink-0"
                  title="Copy webhook URL"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>

              {/* Test Connection + Result */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleTestWaBusiness}
                  disabled={waBusinessTesting || !waBusinessPhoneNumberId || !waBusinessAccessToken}
                  className="text-xs font-bold bg-green/20 text-green px-4 py-2 rounded-full hover:bg-green/30 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {waBusinessTesting ? (
                    <><div className="w-3 h-3 border-2 border-green/30 border-t-green rounded-full animate-spin" /> Testing...</>
                  ) : (
                    <><Zap size={12} /> Test Connection</>
                  )}
                </button>

                {waBusinessTestResult && (
                  <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full ${
                    waBusinessTestResult.success
                      ? 'bg-green/10 text-green border border-green/20'
                      : 'bg-red/10 text-red border border-red/20'
                  }`}>
                    {waBusinessTestResult.success ? (
                      <><CheckCircle2 size={14} /> Connected: {waBusinessTestResult.name} ({waBusinessTestResult.phone})</>
                    ) : (
                      <><XCircle size={14} /> {waBusinessTestResult.error}</>
                    )}
                  </div>
                )}
              </div>

              <p className="text-[10px] text-zinc-500">
                Get credentials from <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-sky underline">Meta Developer Console</a>.
                First 1,000 business-initiated conversations/month are free (India).
              </p>
            </div>
          )}
        </div>

        {/* Gmail / Email Integration Config */}
        <div className="border border-glass-border/40 p-5 rounded-xl bg-white/5 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold flex items-center gap-2 text-sky">
              <Mail size={16} /> Gmail / Email Integration
            </h4>
          </div>

          <div className="pt-2 space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider block">
                Gmail Authentication Method
              </label>
              <div className="flex gap-4">
                <label className="inline-flex items-center text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="gmailAuthMethod"
                    value="password"
                    checked={gmailAuthMethod === 'password'}
                    onChange={() => setGmailAuthMethod('password')}
                    className="mr-2 accent-green"
                  />
                  App Password
                </label>
                <label className="inline-flex items-center text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="radio"
                    name="gmailAuthMethod"
                    value="oauth2"
                    checked={gmailAuthMethod === 'oauth2'}
                    onChange={() => setGmailAuthMethod('oauth2')}
                    className="mr-2 accent-green"
                  />
                  Google OAuth2
                </label>
              </div>
            </div>

            {gmailAuthMethod === 'password' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-2">
                  <label htmlFor="gmailUser" className="text-xs font-bold text-muted uppercase tracking-wider">
                    Gmail Login ID
                  </label>
                  <input
                    id="gmailUser"
                    type="email"
                    className="premium-input w-full"
                    placeholder="e.g. pharmacy@gmail.com"
                    value={gmailUser}
                    onChange={(e) => setGmailUser(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="gmailPass" className="text-xs font-bold text-muted uppercase tracking-wider">
                    Gmail App Password
                  </label>
                  <input
                    id="gmailPass"
                    type="password"
                    className="premium-input w-full"
                    placeholder="e.g. abcd efgh ijkl mnop"
                    value={gmailPass}
                    onChange={(e) => setGmailPass(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                  <div className="space-y-2">
                    <label htmlFor="gmailUser" className="text-xs font-bold text-muted uppercase tracking-wider">
                      Gmail Login ID
                    </label>
                    <input
                      id="gmailUser"
                      type="email"
                      className="premium-input w-full"
                      placeholder="e.g. pharmacy@gmail.com"
                      value={gmailUser}
                      onChange={(e) => setGmailUser(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="googleClientId" className="text-xs font-bold text-muted uppercase tracking-wider">
                      Google Client ID
                    </label>
                    <input
                      id="googleClientId"
                      type="text"
                      className="premium-input w-full"
                      placeholder="Google OAuth2 Client ID"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="googleClientSecret" className="text-xs font-bold text-muted uppercase tracking-wider">
                      Google Client Secret
                    </label>
                    <input
                      id="googleClientSecret"
                      type="password"
                      className="premium-input w-full"
                      placeholder="Google OAuth2 Client Secret"
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await handleSaveSettings();
                      const backendUrl = apiClient.defaults.baseURL || window.location.origin;
                      window.open(`${backendUrl}/api/email/auth/google`, '_blank');
                    }}
                    className="premium-btn bg-primary text-white hover:bg-blue-600 font-bold text-sm flex items-center gap-2"
                    disabled={!googleClientId || !googleClientSecret}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.483 0-6.312-2.829-6.312-6.312 0-3.483 2.829-6.312 6.312-6.312 1.624 0 3.099.619 4.228 1.628l3.143-3.143C19.123 2.115 15.903 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.236 0 11.667-4.488 11.667-11.24 0-.762-.067-1.495-.19-2.205H12.24z"/>
                    </svg>
                    Link Gmail Account
                  </button>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Note: Add <strong>{window.location.origin}/api/email/auth/google/callback</strong> to your Google Cloud Console Authorized Redirect URIs.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Auto-delete / Retention controls */}
          <div className="pt-4 border-t border-glass-border/30 space-y-4 mt-6">
            <h5 className="text-xs font-bold text-sky uppercase tracking-wider">Attachment Auto-cleanup</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="flex items-center">
                <label className="flex items-center gap-3 cursor-pointer select-none group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={emailAutodeleteEnabled}
                      onChange={(e) => setEmailAutodeleteEnabled(e.target.checked)}
                      aria-label="Enable Email Attachment Auto-delete"
                    />
                    <div className="w-11 h-6 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
                  </div>
                  <span className="text-sm font-semibold group-hover:text-white transition-colors">
                    Auto-delete Older Attachments (Keep last N emails)
                  </span>
                </label>
              </div>

              {emailAutodeleteEnabled && (
                <div className="space-y-2">
                  <label htmlFor="emailAutodeleteLimit" className="text-xs font-bold text-muted uppercase tracking-wider block">
                    Retention Limit (emails count)
                  </label>
                  <input
                    id="emailAutodeleteLimit"
                    type="number"
                    min={1}
                    className="premium-input w-full"
                    placeholder="10"
                    value={emailAutodeleteLimit}
                    onChange={(e) => setEmailAutodeleteLimit(Number(e.target.value))}
                  />
                </div>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 italic">
              Note: Older attachments will only be deleted if the corresponding bill has already been saved/imported, ensuring no data loss.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button 
            onClick={handleSaveSettings}
            className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600 flex items-center gap-2"
          >
            <Save size={16} />
            Save Integrations
          </button>
        </div>
      </div>

      {/* ─── Pharmarack Integration ─── */}
      <div className="glass-panel p-6">
        <h3 className="font-bold flex items-center gap-2 mb-6">
          <Globe size={18} className="text-sky" />
          Pharmarack Integration Settings
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-2">
            <label htmlFor="prMode" className="text-xs font-bold text-muted uppercase tracking-wider">
              Connection Mode
            </label>
            <select
              id="prMode"
              className="premium-input w-full bg-zinc-900 border-glass-border/60 text-xs py-2"
              value={prMode}
              onChange={(e) => setPrMode(e.target.value)}
            >
              <option value="Simulation">Simulation Mode (Pre-populated Screenshots & Demo Data)</option>
              <option value="Live">Live Scraper Mode (Interprets Session Cookie / Token)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="prUsername" className="text-xs font-bold text-muted uppercase tracking-wider">
              Pharmarack Mobile / Username
            </label>
            <input
              id="prUsername"
              type="text"
              className="premium-input w-full"
              placeholder="e.g. 9876543210"
              value={prUsername}
              onChange={(e) => setPrUsername(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="prPassword" className="text-xs font-bold text-muted uppercase tracking-wider">
              Pharmarack Password
            </label>
            <input
              id="prPassword"
              type="password"
              className="premium-input w-full"
              placeholder="••••••••"
              value={prPassword}
              onChange={(e) => setPrPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="prToken" className="text-xs font-bold text-muted uppercase tracking-wider">
              Pharmarack Intercepted Session Token / Cookies
            </label>
            <input
              id="prToken"
              type="text"
              className="premium-input w-full"
              placeholder="Copy Bearer token or cookies from browser DevTools"
              value={prToken}
              onChange={(e) => setPrToken(e.target.value)}
            />
          </div>
        </div>

        <p className="text-[10px] text-zinc-500 mt-4 leading-relaxed">
          <strong>How to capture token:</strong> Log in to <code>retailers.pharmarack.com</code> in your browser. Open Developer Tools (F12), go to the Network tab, type in the search bar, look for an API request, and copy the value of the <code>Authorization</code> header or request cookies. Paste it here to enable background live searching!
        </p>

        <div className="mt-6 flex flex-wrap gap-3 justify-end">
          <button 
            type="button"
            onClick={handleOpenLoginWindow}
            disabled={isOpeningWindow}
            className="premium-btn bg-sky-500 hover:bg-sky-400 text-white shadow-[0_4px_14px_rgba(14,165,233,0.4)] flex items-center gap-2"
          >
            {isOpeningWindow ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Waiting for browser login...
              </>
            ) : (
              <>
                <LogIn size={16} />
                Log In (Chrome Popup)
              </>
            )}
          </button>
          
          <button 
            type="button"
            onClick={handlePharmarackLogout}
            className="premium-btn bg-red-600 hover:bg-red-500 text-white shadow-[0_4px_14px_rgba(239,68,68,0.4)] flex items-center gap-2"
          >
            <LogOut size={16} />
            Log Out Pharmarack
          </button>

          <button 
            onClick={handleSaveSettings}
            className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600 flex items-center gap-2"
          >
            <Save size={16} />
            Save Pharmarack Settings
          </button>
        </div>
      </div>

      {/* ─── Background Automations ─── */}
      <div className="glass-panel p-6">
        <h3 className="font-bold flex items-center gap-2 mb-6">
          <Zap size={18} className="text-amber" />
          Background Automations
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <div className="space-y-2 flex items-end">
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={automationEnabled}
                  onChange={(e) => setAutomationEnabled(e.target.checked)}
                  aria-label="Enable Background Automations"
                />
                <div className="w-11 h-6 rounded-full bg-zinc-700 peer-checked:bg-green transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform peer-checked:translate-x-5" />
              </div>
              <span className="text-sm font-semibold group-hover:text-white transition-colors">
                Enable Background Automations
              </span>
            </label>
          </div>
        </div>

        <p className="text-xs text-muted mt-4 max-w-3xl leading-relaxed">
          Enabling this starts background services at startup including: WhatsApp client pre-initialization, the WhatsApp queue worker, the catalog upload process, daily checks for patient refills, and automatic near-expiry scans.
          <br />
          <span className="text-amber/85 font-semibold italic">Note: Changing this setting requires a server restart to take effect.</span>
        </p>

        <div className="mt-6 flex justify-end">
          <button 
            onClick={handleSaveSettings}
            className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600 flex items-center gap-2"
          >
            <Save size={16} />
            Save Automations
          </button>
        </div>
      </div>

      {/* ─── System ─── */}
      <div className="glass-panel p-6">
        <h3 className="font-bold flex items-center gap-2 mb-6">
          <HardDrive size={18} className="text-green" />
          System
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div className="flex flex-col gap-3">
            <button className="premium-btn bg-primary text-white shadow-[0_4px_14px_rgba(59,130,246,0.4)] hover:bg-blue-600 flex items-center gap-2 w-full justify-center">
              <Database size={16} />
              Database Backup
            </button>

            <div className="space-y-2">
              <label htmlFor="dbRestore" className="text-xs font-bold text-muted uppercase tracking-wider">
                Database Restore
              </label>
              <div className="flex gap-2">
                <input
                  id="dbRestore"
                  type="file"
                  className="premium-input w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-700 file:text-zinc-300 hover:file:bg-zinc-600 file:cursor-pointer"
                  accept=".sql,.bak,.db,.sqlite"
                  aria-label="Choose database backup file"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button className="premium-btn bg-red text-white shadow-[0_4px_14px_rgba(239,68,68,0.4)] hover:bg-red-600 flex items-center gap-2 w-full justify-center">
              <Trash2 size={16} />
              Clear Cache
            </button>

            <div className="glass-panel p-4 flex items-center justify-between bg-white/5 border border-glass-border">
              <span className="text-xs font-bold text-muted uppercase tracking-wider">App Version</span>
              <span className="text-sm font-semibold text-sky">v2.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
