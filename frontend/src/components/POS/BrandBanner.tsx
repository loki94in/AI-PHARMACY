import { Plus } from 'lucide-react';

const BrandBanner = () => (
  <div className="flex items-center justify-between border-b border-glass-border/30 pb-2 bg-gradient-to-r from-sky/10 via-transparent to-transparent px-2">
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-sky/10 border border-sky/30">
        <svg className="w-4.5 h-4.5 text-sky" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 4V20M4 12H20" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
          <circle cx="12" cy="12" r="1.5" className="fill-white animate-pulse" />
        </svg>
      </div>
      <span className="font-black tracking-widest text-xs bg-gradient-to-r from-text to-sky bg-clip-text text-transparent">
        NEXT MEDICIN OS
      </span>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold text-muted font-mono">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green/10 border border-green/20 text-[9px] font-bold text-green uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse"></span>
        Online Counter
      </div>
    </div>
  </div>
);

export default BrandBanner;
