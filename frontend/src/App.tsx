import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
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
  X,
  Sun,
  Moon
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { toastEvent, quickOrderEvent } from './services/events';
import { QuickOrderModal } from './components/QuickOrderModal';

import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Purchases from './pages/Purchases';
import CRM from './pages/CRM';
import Migration from './pages/Migration';
import Doctors from './pages/Doctors';
import Dispatch from './pages/Dispatch';
import Reports from './pages/Reports';
import License from './pages/License';
import Settings from './pages/Settings';
import Mail from './pages/Mail';
import Returns from './pages/Returns';
import Orders from './pages/Orders';
import Expiry from './pages/Expiry';
import Sells from './pages/Sells';

const Sidebar = () => {
  const location = useLocation();
  const menuItems = [
    { path: '/pos', label: 'Sales / POS', icon: <ShoppingCart size={18} /> },
    { path: '/sells', label: 'Sells / Bills', icon: <Receipt size={18} /> },
    { path: '/manual-purchase', label: 'Manual Purchase', icon: <Receipt size={18} /> },
    { path: '/purchases', label: 'Purchase History', icon: <Receipt size={18} /> },
    { path: '/mail', label: 'Distributor Mail', icon: <Activity size={18} /> },
    { path: '/inventory', label: 'Inventory', icon: <PackageSearch size={18} /> },
    { path: '/returns', label: 'Returns', icon: <RotateCcw size={18} /> },
    { path: '/expiry', label: 'Expiry Monitor', icon: <CalendarDays size={18} /> },
    { path: '/crm', label: 'CRM / Patients', icon: <Users size={18} /> },
    { path: '/orders', label: 'Orders & Requests', icon: <ClipboardList size={18} /> },
    { path: '/doctors', label: 'Doctors', icon: <UserPlus size={18} /> },
    { path: '/catalog', label: 'Catalog Upload', icon: <Database size={18} /> },
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
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
          {/* Futuristic plus icon logo */}
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

const Topbar = () => {
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.body.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.body.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };
  
  // Map paths to dynamic header titles
  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/':
        return 'Dashboard';
      case '/pos':
        return 'Sales / POS';
      case '/sells':
        return 'Sells / Bills';
      case '/inventory':
        return 'Inventory Master';
      case '/purchases':
        return 'Purchase History';
      case '/returns':
        return 'Returns & Expiry';
      case '/expiry':
        return 'Expiry Monitor';
      case '/crm':
        return 'CRM / Patients';
      case '/orders':
        return 'Orders & Requests';
      case '/migration':
        return 'Data Migration';
      case '/manual-purchase':
        return 'Manual Purchase';
      case '/mail':
        return 'Distributor Mail';
      case '/doctors':
        return 'Doctors';
      case '/catalog':
        return 'Catalog Upload';
      case '/dispatch':
        return 'Dispatch';
      case '/reports':
        return 'Reports';
      case '/learning':
        return 'AI Learning';
      case '/license':
        return 'License';
      case '/settings':
        return 'Settings';
      default:
        return 'Administration';
    }
  };

  const title = getPageTitle(location.pathname);

  return (
    <header className="h-16 bg-glass-bg border-b border-glass-border backdrop-blur-xl flex items-center justify-between px-8 shrink-0">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
      </div>
      <div className="flex items-center gap-4">
        {/* Quick Request Trigger Button */}
        <button
          onClick={() => quickOrderEvent.triggerOpen()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:border-primary/40 text-primary hover:text-white transition-all text-xs font-bold active:scale-95 group shadow-[0_0_12px_rgba(59,130,246,0.05)]"
          title="Quick Order / Special Request (Alt + O)"
        >
          <Plus size={13} className="group-hover:rotate-90 transition-transform duration-300" />
          <span>Quick Request</span>
          <span className="hidden sm:inline text-[9px] bg-black/40 border border-white/10 text-muted px-1.5 py-0.5 rounded font-mono font-normal">Alt + O</span>
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-bg border border-green/20">
          <div className="w-2 h-2 rounded-full bg-green animate-pulse"></div>
          <span className="text-xs font-bold text-green uppercase tracking-wide">Connected</span>
        </div>
        <button 
          onClick={toggleTheme} 
          className="p-2 text-muted hover:text-white transition-colors flex items-center justify-center" 
          aria-label="Toggle theme" 
          title={theme === 'light' ? "Switch to Night Mode" : "Switch to Day Mode"}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="p-2 text-muted hover:text-white transition-colors flex items-center justify-center" aria-label="Log out" title="Log out">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isFitPage = location.pathname === '/pos' || location.pathname === '/orders' || location.pathname === '/expiry';
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    return toastEvent.subscribe((detail) => {
      setToast(detail);
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text selection:bg-primary/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Topbar />
        <main className={`flex-1 flex flex-col ${isFitPage ? 'overflow-hidden p-4 pt-2 pb-4' : 'overflow-y-auto p-6 pt-4 pb-6'} relative z-10 transition-all duration-200`}>
          {children}
        </main>
        
        {/* Global Modal & Notification elements */}
        <QuickOrderModal />
        
        {toast && (
          <div className={`fixed top-4 right-4 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-xl animate-in slide-in-from-top-4 duration-300 ${
            toast.type === 'success' 
              ? 'bg-green-bg border-green/20 text-green' 
              : toast.type === 'error'
              ? 'bg-red-bg border-red/20 text-red'
              : 'bg-primary/10 border-primary/20 text-primary'
          }`}>
            {toast.type === 'success' && <Check size={18} className="drop-shadow-[0_0_4px_rgba(16,185,129,0.5)]" />}
            {toast.type === 'error' && <AlertTriangle size={18} className="drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]" />}
            {toast.type === 'info' && <Bell size={18} className="drop-shadow-[0_0_4px_rgba(59,130,246,0.5)]" />}
            <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:text-white text-muted/60 transition-colors" title="Dismiss" aria-label="Dismiss toast">
              <X size={14} />
            </button>
          </div>
        )}
        
        {/* Subtle background glow effects wrapped in absolute layout boundary to avoid flexbox side-effects */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-purple/5 rounded-full blur-[100px]" />
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/expiry" element={<Expiry />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/sells" element={<Sells />} />
          <Route path="/manual-purchase" element={<Purchases />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/crm" element={<CRM />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/migration" element={<Migration />} />
          <Route path="/doctors" element={<Doctors />} />
          <Route path="/dispatch" element={<Dispatch />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/license" element={<License />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/mail" element={<Mail />} />
          {/* Fallback route for unimplemented pages */}
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
