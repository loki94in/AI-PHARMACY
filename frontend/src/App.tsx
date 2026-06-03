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
  ClipboardList
} from 'lucide-react';
import React from 'react';

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

const Sidebar = () => {
  const location = useLocation();
  const menuItems = [
    { path: '/pos', label: 'Sales / POS', icon: <ShoppingCart size={18} /> },
    { path: '/manual-purchase', label: 'Manual Purchase', icon: <Receipt size={18} /> },
    { path: '/purchases', label: 'Purchase History', icon: <Receipt size={18} /> },
    { path: '/mail', label: 'Distributor Mail', icon: <Activity size={18} /> },
    { path: '/inventory', label: 'Inventory', icon: <PackageSearch size={18} /> },
    { path: '/returns', label: 'Returns', icon: <RotateCcw size={18} /> },
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
      <div className="p-6 border-b border-glass-border">
        <h1 className="text-xl font-extrabold bg-gradient-to-br from-blue-400 to-purple-400 bg-clip-text text-transparent tracking-tight">
          AI PHARMACY
        </h1>
        <p className="text-xs text-muted mt-1 uppercase tracking-wider font-semibold">OS Version 2.0</p>
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
  
  // Map paths to dynamic header titles
  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/':
        return 'Dashboard';
      case '/pos':
        return 'Sales / POS';
      case '/inventory':
        return 'Inventory Master';
      case '/purchases':
        return 'Purchase History';
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
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-bg border border-green/20">
          <div className="w-2 h-2 rounded-full bg-green animate-pulse"></div>
          <span className="text-xs font-bold text-green uppercase tracking-wide">Connected</span>
        </div>
        <button className="p-2 text-muted hover:text-white transition-colors" aria-label="Log out" title="Log out">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isFitPage = location.pathname === '/pos' || location.pathname === '/orders';

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text selection:bg-primary/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Topbar />
        <main className={`flex-1 flex flex-col ${isFitPage ? 'overflow-hidden p-4 pt-2 pb-4' : 'overflow-y-auto p-6 pt-4 pb-6'} relative z-10 transition-all duration-200`}>
          {children}
        </main>
        
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
          <Route path="/pos" element={<POS />} />
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
