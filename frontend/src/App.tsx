import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  PackageSearch, 
  ShoppingCart, 
  Receipt, 
  Users, 
  UserPlus, 
  Settings as SettingsIcon, 
  Activity,
  LogOut,
  Database,
  RotateCcw,
  ClipboardList,
  CalendarDays,
  Plus,
  Check,
  AlertTriangle,
  Bell,
  BellRing,
  X,
  Sun,
  Moon,
  Trash2,
  ExternalLink,
  Info,
  ChevronRight,
  Mail as MailIcon,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toastEvent, quickOrderEvent } from './services/events';
import type { ToastEventDetail } from './services/events';
import { QuickOrderModal } from './components/QuickOrderModal';
import { apiClient } from './services/api';

import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Purchases from './pages/Purchases';
import CRM from './pages/CRM';
import PurchaseHistory from './pages/PurchaseHistory';
import Migration from './pages/Migration';
import Doctors from './pages/Doctors';
import Dispatch from './pages/Dispatch';
import Reports from './pages/Reports';
import License from './pages/License';
import Settings from './pages/Settings';
import Mail from './pages/Mail';
import Returns from './pages/Returns';
import CatalogUpload from './pages/CatalogUpload';
import Orders from './pages/Orders';
import Expiry from './pages/Expiry';
import Sells from './pages/Sells';

// ──────────────────────────────────────────────
// Notification Types
// ──────────────────────────────────────────────
interface AppNotification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  time: Date;
  read: boolean;
  link?: string;
}

// ──────────────────────────────────────────────
// Sidebar
// ──────────────────────────────────────────────
const Sidebar = () => {
  const location = useLocation();
  const menuItems = [
    { path: '/pos', label: 'Sales / POS', icon: <ShoppingCart size={18} /> },
    { path: '/sells', label: 'Sells / Bills', icon: <Receipt size={18} /> },
    { path: '/purchases', label: 'Purchases', icon: <Receipt size={18} /> },
    { path: '/purchase-history', label: 'Purchase History', icon: <ClipboardList size={18} /> },
    { path: '/mail', label: 'Distributor Mail', icon: <Activity size={18} /> },
    { path: '/inventory', label: 'Inventory', icon: <PackageSearch size={18} /> },
    { path: '/returns', label: 'Returns', icon: <RotateCcw size={18} /> },
    { path: '/expiry', label: 'Expiry Monitor', icon: <CalendarDays size={18} /> },
    { path: '/crm', label: 'CRM / Patients', icon: <Users size={18} /> },
    { path: '/orders', label: 'Orders & Requests', icon: <ClipboardList size={18} /> },
    { path: '/doctors', label: 'Doctors', icon: <UserPlus size={18} /> },
    { path: '/catalog', label: 'Catalog Upload', icon: <Database size={18} /> },
    { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: '/dispatch', label: 'Dispatch', icon: <Activity size={18} /> },
    { path: '/reports', label: 'Reports', icon: <LayoutDashboard size={18} /> },
    { path: '/learning', label: 'AI Learning', icon: <Activity size={18} /> },
    { path: '/migration', label: 'Data Migration', icon: <Database size={18} /> },
    { path: '/license', label: 'License', icon: <Database size={18} /> },
    { path: '/settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
  ];

  return (
    <div className="w-64 bg-glass-bg border-r border-glass-border backdrop-blur-xl flex flex-col h-full overflow-y-auto">
      <div className="p-5 border-b border-glass-border flex flex-col gap-1 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-sky/20 to-sky/5 border border-sky/30 shadow-[0_0_15px_rgba(14,165,233,0.2)] shrink-0 transition-all duration-300">
            <svg className="w-5.5 h-5.5 text-sky drop-shadow-[0_0_6px_rgba(14,165,233,0.6)]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4V20M4 12H20" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"/>
              <path d="M12 8.5V15.5M8.5 12H15.5" stroke="#fafafa" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green"></span>
            </span>
          </div>
          <div>
            <h1 className="text-base font-black tracking-wider bg-gradient-to-r from-text to-sky bg-clip-text text-transparent leading-none">
              NEXT MEDICIN
            </h1>
            <p className="text-[9px] text-muted tracking-widest uppercase font-bold mt-1 leading-none">OS Version 2.0</p>
          </div>
        </div>
      </div>
      
      <div className="py-4 flex-1">
        <div className="px-5 mb-2 text-[10px] font-bold tracking-[0.15em] uppercase text-muted/70">Main Menu</div>
        <nav className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-3 px-5 py-2.5 mx-2 rounded-lg text-sm font-medium transition-all duration-200
                  ${isActive 
                    ? 'text-white bg-gradient-to-r from-primary/20 to-transparent border-l-2 border-primary shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]' 
                    : 'text-muted hover:text-white hover:bg-white/5 hover:translate-x-1 border-l-2 border-transparent'}
                `}
              >
                <span className={`${isActive ? 'text-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}`}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-glass-border">
        <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted">
          <Activity size={16} className="text-green" />
          <span>System Online</span>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────
// Flash Toast — small pop at top-center
// ──────────────────────────────────────────────
const FlashToast = ({ toast, onDismiss }: { toast: (ToastEventDetail & { id: number }) | null; onDismiss: () => void }) => {
  if (!toast) return null;

  const cfg = {
    success: { bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', icon: <Check size={15} className="shrink-0" />, glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]' },
    error:   { bg: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400',                 icon: <AlertTriangle size={15} className="shrink-0" />, glow: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]' },
    info:    { bg: 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400',                 icon: <Info size={15} className="shrink-0" />, glow: 'shadow-[0_0_20px_rgba(14,165,233,0.15)]' },
  }[toast.type];

  return (
    <div
      key={toast.id}
      className={`
        fixed top-4 left-1/2 -translate-x-1/2 z-[9999999]
        flex items-center gap-2.5 px-4 py-2.5 rounded-2xl
        border backdrop-blur-2xl ${cfg.bg} ${cfg.glow}
        animate-in slide-in-from-top-3 fade-in duration-300
        min-w-[260px] max-w-[420px]
      `}
      style={{ animation: 'slideInDown 0.3s ease' }}
    >
      {cfg.icon}
      <span className="text-sm font-semibold flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="ml-1 opacity-50 hover:opacity-100 transition-opacity shrink-0"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
};

// ──────────────────────────────────────────────
// Notification Panel
// ──────────────────────────────────────────────
const NotificationPanel = ({
  notifications,
  onClearAll,
  onClearOne,
  onMarkRead,
  onClose,
}: {
  notifications: AppNotification[];
  onClearAll: () => void;
  onClearOne: (id: number) => void;
  onMarkRead: (id: number) => void;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const typeConfig = (type: string) => {
    if (type === 'success') return { dot: 'bg-emerald-400', text: 'text-emerald-400', icon: <Check size={14} />, label: 'Success' };
    if (type === 'error')   return { dot: 'bg-red-400',     text: 'text-red-400',     icon: <AlertTriangle size={14} />, label: 'Error' };
    return                         { dot: 'bg-sky-400',     text: 'text-sky-400',     icon: <Info size={14} />,          label: 'Info' };
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-3 w-96 z-[999999] flex flex-col rounded-2xl overflow-hidden glass-panel"
      style={{
        backdropFilter: 'blur(24px)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
        <div className="flex items-center gap-2.5">
          <BellRing size={16} className="text-sky-400" />
          <span className="text-sm font-bold text-text tracking-wide">Notifications</span>
          {unread > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/30 text-sky-400 text-[10px] font-bold">
              {unread} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1 text-[10px] font-semibold text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
            >
              <Trash2 size={11} />
              Clear All
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-black/10 transition-all"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Notification List */}
      <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-black/5 border border-glass-border flex items-center justify-center">
              <Bell size={26} className="text-muted opacity-40" />
            </div>
            <p className="text-muted text-sm font-medium">All caught up!</p>
            <p className="text-muted/50 text-xs">No notifications right now</p>
          </div>
        ) : (
          <div className="py-1">
            {notifications.map((notif, idx) => {
              const cfg = typeConfig(notif.type);
              return (
                <div
                  key={notif.id}
                  className={`
                    group flex gap-3 px-4 py-3 relative transition-all duration-200
                    ${!notif.read ? 'bg-primary/[0.04]' : 'hover:bg-black/[0.03]'}
                    ${idx < notifications.length - 1 ? 'border-b border-glass-border' : ''}
                  `}
                  onClick={() => onMarkRead(notif.id)}
                >
                  {/* Unread indicator bar */}
                  {!notif.read && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-sky-500 rounded-r" />
                  )}

                  {/* Type Icon */}
                  <div className={`
                    shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5
                    ${notif.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 
                      notif.type === 'error'   ? 'bg-red-500/10 text-red-400' : 
                                                 'bg-sky-500/10 text-sky-400'}
                  `}>
                    {cfg.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${!notif.read ? 'text-text font-medium' : 'text-muted'}`}>
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</span>
                      <span className="text-[10px] text-muted/50">·</span>
                      <span className="text-[10px] text-muted/50 font-mono">{formatTime(notif.time)}</span>
                    </div>
                    {/* Open link if available */}
                    {notif.link && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onMarkRead(notif.id);
                          navigate(notif.link!);
                          onClose();
                        }}
                        className="flex items-center gap-1 mt-1.5 text-[10px] font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        <ExternalLink size={10} />
                        Open
                        <ChevronRight size={10} />
                      </button>
                    )}
                  </div>

                  {/* Clear One Button */}
                  <button
                    onClick={e => { e.stopPropagation(); onClearOne(notif.id); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-400 mt-0.5 cursor-pointer"
                    aria-label="Remove notification"
                    title="Remove"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2.5 border-t border-glass-border flex items-center justify-between">
          <span className="text-[10px] text-muted">{notifications.length} total notification{notifications.length !== 1 ? 's' : ''}</span>
          {unread > 0 && (
            <button
              onClick={() => notifications.forEach(n => { if (!n.read) onMarkRead(n.id); })}
              className="text-[10px] font-semibold text-sky-400 hover:text-sky-300 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────
// Topbar
// ──────────────────────────────────────────────
const Topbar = ({
  notifications,
  hasUnread,
  onNewNotification,
  onClearAll,
  onClearOne,
  onMarkRead,
}: {
  notifications: AppNotification[];
  hasUnread: boolean;
  onNewNotification: (n: ToastEventDetail) => void;
  onClearAll: () => void;
  onClearOne: (id: number) => void;
  onMarkRead: (id: number) => void;
}) => {
  const location = useLocation();
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'dark'; }
    catch { return 'dark'; }
  });
  const [showPanel, setShowPanel] = useState(false);
  const [flashToast, setFlashToast] = useState<(ToastEventDetail & { id: number }) | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.body.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.body.classList.remove('light');
    }
    try { localStorage.setItem('theme', theme); } catch { }
  }, [theme]);

  // Listen for toast events — show flash AND add to panel
  useEffect(() => {
    return toastEvent.subscribe((detail) => {
      onNewNotification(detail);
      // Show flash
      const id = Date.now();
      setFlashToast({ ...detail, id });
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashToast(null), 4000);
    });
  }, [onNewNotification]);

  // Connect to backend real-time notification SSE stream
  useEffect(() => {
    const backendUrl = apiClient.defaults.baseURL || window.location.origin;
    const cleanBaseUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    const sseUrl = `${cleanBaseUrl}/api/notifications/stream`;
    
    let eventSource: EventSource | null = null;
    
    const connectSSE = () => {
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'auth_failure' || data.type === 'auth_required' || data.type === 'notification') {
            toastEvent.trigger(
              data.payload.message || data.message || 'Action required',
              'error',
              '/settings'
            );
          }
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('SSE disconnected or failed, retrying in 5 seconds...', err);
        eventSource?.close();
        setTimeout(connectSSE, 5000);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const dismissFlash = useCallback(() => {
    clearTimeout(flashTimerRef.current);
    setFlashToast(null);
  }, []);

  const handleBellClick = () => {
    setShowPanel(prev => !prev);
  };

  const getPageTitle = (pathname: string) => {
    const map: Record<string, string> = {
      '/dashboard': 'Dashboard',
      '/pos': 'Sales / POS',
      '/sells': 'Sells / Bills',
      '/inventory': 'Inventory Master',
      '/purchases': 'Purchases',
      '/purchase-history': 'Purchase History',
      '/returns': 'Returns & Expiry',
      '/expiry': 'Expiry Monitor',
      '/crm': 'CRM / Patients',
      '/orders': 'Orders & Requests',
      '/migration': 'Data Migration',

      '/mail': 'Distributor Mail',
      '/doctors': 'Doctors',
      '/catalog': 'Catalog Upload',
      '/dispatch': 'Dispatch',
      '/reports': 'Reports',
      '/learning': 'AI Learning',
      '/license': 'License',
      '/settings': 'Settings',
    };
    return map[pathname] || 'Administration';
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      {/* Flash Toast — top center */}
      <FlashToast toast={flashToast} onDismiss={dismissFlash} />

      <header className="h-16 bg-glass-bg border-b border-glass-border backdrop-blur-xl flex items-center justify-between px-8 shrink-0 relative z-40">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold tracking-tight text-white">{getPageTitle(location.pathname)}</h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick Request */}
          <button
            onClick={() => quickOrderEvent.triggerOpen()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:border-primary/40 text-primary hover:text-white transition-all text-xs font-bold active:scale-95 group shadow-[0_0_12px_rgba(59,130,246,0.05)]"
            title="Quick Order / Special Request (Alt + O)"
          >
            <Plus size={13} className="group-hover:rotate-90 transition-transform duration-300" />
            <span>Quick Request</span>
            <span className="hidden sm:inline text-[9px] bg-black/40 border border-white/10 text-muted px-1.5 py-0.5 rounded font-mono font-normal">Alt + O</span>
          </button>

          {/* Connected badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-bg border border-green/20">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse"></div>
            <span className="text-xs font-bold text-green uppercase tracking-wide">Connected</span>
          </div>

          {/* ── Notification Bell ── */}
          <div className="relative">
            <button
              id="notification-bell-btn"
              onClick={handleBellClick}
              className={`
                relative p-2.5 rounded-xl transition-all duration-200 flex items-center justify-center
                ${showPanel
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.2)]'
                  : 'text-muted hover:text-white hover:bg-white/8 border border-transparent'}
              `}
              aria-label="Notifications"
              title="View Notifications"
            >
              {hasUnread ? (
                <BellRing size={18} className={showPanel ? 'text-sky-400' : 'text-white'} />
              ) : (
                <Bell size={18} />
              )}

              {/* Unread badge */}
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60"></span>
                  <span className="relative inline-flex items-center justify-center rounded-full h-4 w-4 bg-red-500 text-white text-[9px] font-black border border-black/40">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </span>
              )}

              {/* Soft blinking dot when unread but count collapses (always visible) */}
              {unreadCount === 0 && hasUnread && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500/60 animate-pulse" />
              )}
            </button>

            {/* Panel */}
            {showPanel && (
              <NotificationPanel
                notifications={notifications}
                onClearAll={onClearAll}
                onClearOne={onClearOne}
                onMarkRead={onMarkRead}
                onClose={() => setShowPanel(false)}
              />
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
            className="p-2 text-muted hover:text-white transition-colors flex items-center justify-center"
            aria-label="Toggle theme"
            title={theme === 'light' ? 'Switch to Night Mode' : 'Switch to Day Mode'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <button className="p-2 text-muted hover:text-white transition-colors flex items-center justify-center" aria-label="Log out" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </header>
    </>
  );
};

// ──────────────────────────────────────────────
// Layout (holds notification state globally)
// ──────────────────────────────────────────────
const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isFitPage = location.pathname === '/pos' || location.pathname === '/orders' || location.pathname === '/expiry';

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  // hasUnread persists even after all are "read" — cleared only when user explicitly clears/reads
  const [hasUnread, setHasUnread] = useState(false);

  const handleNewNotification = useCallback((detail: ToastEventDetail) => {
    const newNotif: AppNotification = {
      id: Date.now(),
      message: detail.message,
      type: detail.type,
      time: new Date(),
      read: false,
      link: detail.link,
    };
    setNotifications(prev => [newNotif, ...prev].slice(0, 50));
    setHasUnread(true);
  }, []);

  const handleClearAll = useCallback(() => {
    setNotifications([]);
    setHasUnread(false);
  }, []);

  const handleClearOne = useCallback((id: number) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id);
      if (updated.every(n => n.read)) setHasUnread(false);
      return updated;
    });
  }, []);

  const handleMarkRead = useCallback((id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text selection:bg-primary/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Topbar
          notifications={notifications}
          hasUnread={hasUnread}
          onNewNotification={handleNewNotification}
          onClearAll={handleClearAll}
          onClearOne={handleClearOne}
          onMarkRead={handleMarkRead}
        />
        <main className={`flex-1 flex flex-col ${isFitPage ? 'overflow-hidden p-4 pt-2 pb-4' : 'overflow-y-auto p-6 pt-4 pb-6'} relative z-10 transition-all duration-200`}>
          {children}
        </main>
        
        {/* Global Modals */}
        <QuickOrderModal />

        {/* Subtle background glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-purple/5 rounded-full blur-[100px]" />
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────
// App
// ──────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/expiry" element={<Expiry />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/sells" element={<Sells />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/purchase-history" element={<PurchaseHistory />} />
          <Route path="/crm" element={<CRM />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/migration" element={<Migration />} />
          <Route path="/doctors" element={<Doctors />} />
          <Route path="/dispatch" element={<Dispatch />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/license" element={<License />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/mail" element={<Mail />} />
          <Route path="/catalog" element={<CatalogUpload />} />
          <Route path="*" element={
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <h1 className="text-2xl font-bold mb-2">Coming Soon</h1>
              <p>This module is currently being migrated to React.</p>
            </div>
          } />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
