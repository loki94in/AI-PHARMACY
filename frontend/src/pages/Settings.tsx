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

  useEffect(() => {
    let interval: NodeJS.Timeout;
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
      interval = setInterval(fetchQR, 5000); // Poll every 5s
    }
    return () => clearInterval(interval);
  }, [whatsappEnabled, waStatus.isReady]);

  const handleReconnect = async () => {
    try {
      setWaStatus({ isReady: false, qrUrl: null, message: 'Reconnecting...' });
      await apiClient.post('/messaging/reconnect');
      toastEvent.trigger({ message: 'WhatsApp reconnecting...', type: 'info' });
    } catch (error) {
      console.error('Failed to reconnect', error);
      toastEvent.trigger({ message: 'Failed to reconnect WhatsApp', type: 'error' });
    }
  };

  return (
    <div className="h-full flex flex-col fade-in space-y-6 overflow-y-auto pb-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight mb-1 flex items-center gap-2">
          <SettingsIcon size={22} className="text-muted" />
          Settings
        </h2>
        <p className="text-muted text-sm">Configure your pharmacy application.</p>
      </div>

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
          <button className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600 flex items-center gap-2">
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
                <div className="flex gap-2 justify-center mt-2">
                  {!waStatus.isReady && (
                    <button 
                      onClick={() => setWaStatus({ ...waStatus, qrUrl: null })}
                      className="text-xs font-bold bg-primary/20 text-primary px-4 py-1.5 rounded-full hover:bg-primary/30 transition-all"
                    >
                      Refresh Status
                    </button>
                  )}
                  <button 
                    onClick={handleReconnect}
                    className="text-xs font-bold bg-red/20 text-red px-4 py-1.5 rounded-full hover:bg-red/30 transition-all flex items-center gap-1"
                    title="Force logout and generate a new QR code"
                  >
                    <RefreshCw size={12} /> Force Reconnect
                  </button>
                </div>
              </div>
            </div>
          )}
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
