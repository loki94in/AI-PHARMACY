import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Filter
} from 'lucide-react';
import { apiClient } from '../../services/api';
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

export default function DeviceLogs() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'disconnected'>('all');
  const [clearing, setClearing] = useState(false);

  // Set page headers for SEO
  useEffect(() => {
    document.title = 'Device Logs - AI Pharmacy';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'View active device connection status and historical connection logs.');
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [devRes, logRes] = await Promise.all([
        apiClient.get('/notifications/devices'),
        apiClient.get('/notifications/devices/logs')
      ]);
      if (devRes.data?.devices) setDevices(devRes.data.devices);
      if (logRes.data?.logs) setLogs(logRes.data.logs);
    } catch (err: any) {
      console.error('Failed to fetch device data:', err);
      toastEvent.trigger('Failed to fetch device status data.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogsOnly = useCallback(async () => {
    setLogsLoading(true);
    try {
      const { data } = await apiClient.get('/notifications/devices/logs');
      if (data?.logs) setLogs(data.logs);
    } catch (err: any) {
      console.error('Failed to fetch device logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Poll logs and status every 8 seconds
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear connection logs?')) return;
    setClearing(true);
    try {
      await apiClient.post('/notifications/devices/logs/clear');
      toastEvent.trigger('Activity logs cleared successfully.', 'success');
      setLogs([]);
    } catch (err: any) {
      console.error('Failed to clear device logs:', err);
      toastEvent.trigger('Failed to clear device activity logs.', 'error');
    } finally {
      setClearing(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
    } catch {
      return iso;
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = log.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            log.os.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [logs, searchQuery, statusFilter]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden text-text">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-glass-bg border border-glass-border p-4 rounded-2xl mb-4 shrink-0 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-bg border border-border hover:bg-bg3 hover:border-glass-border text-muted hover:text-white transition-all"
            title="Go Back"
            id="back-btn"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
            <Smartphone size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Device Activity & Connection Logs</h1>
            <p className="text-xs text-muted">Monitor active devices and inspect live connect/disconnect logs</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-xl bg-bg border border-border hover:bg-bg3 hover:border-glass-border text-muted hover:text-white transition-all"
            title="Refresh logs"
            id="refresh-btn"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          
          <button
            onClick={handleClearLogs}
            disabled={clearing || logs.length === 0}
            className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-white text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5"
            id="clear-logs-btn"
          >
            <Trash2 size={13} />
            Clear Logs
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: Current Registered Devices Status */}
        <div className="w-full md:w-1/3 flex flex-col bg-glass-bg border border-glass-border rounded-2xl overflow-hidden backdrop-blur-xl shrink-0">
          <div className="p-4 border-b border-glass-border bg-white/[0.02]">
            <h2 className="font-bold text-xs uppercase tracking-wider text-muted">Registered Devices ({devices.length})</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {loading && devices.length === 0 ? (
              <div className="text-center text-muted text-xs py-10">
                <RefreshCw size={20} className="animate-spin mx-auto mb-2 opacity-50" />
                Loading devices...
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center text-muted text-xs py-10 border border-dashed border-border rounded-xl">
                No devices connected or registered.
              </div>
            ) : (
              devices.map((device) => {
                const isOnline = device.is_online === 1;
                const statusBadge = isOnline
                  ? 'bg-green/10 border-green/20 text-green'
                  : 'bg-zinc-500/10 border-zinc-500/20 text-muted';
                
                return (
                  <div key={device.token} className="p-3 bg-bg2/40 border border-glass-border/30 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Smartphone size={16} className={isOnline ? 'text-green animate-pulse' : 'text-muted'} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-text truncate">{device.device_name}</p>
                          <p className="text-[10px] text-muted capitalize">{device.os}</p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusBadge}`}>
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    <div className="text-[9px] text-muted font-mono flex items-center justify-between pt-1 border-t border-border/20">
                      <span>Last Seen:</span>
                      <span>{device.last_seen ? formatDate(device.last_seen) : 'Never'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Activity Log Timeline */}
        <div className="flex-1 flex flex-col bg-glass-bg border border-glass-border rounded-2xl overflow-hidden backdrop-blur-xl">
          
          {/* Timeline Filter Controls */}
          <div className="p-4 border-b border-glass-border bg-white/[0.02] flex flex-col sm:flex-row gap-3 justify-between items-center shrink-0">
            <h2 className="font-bold text-xs uppercase tracking-wider text-muted">Activity Logs ({filteredLogs.length})</h2>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-48">
                <Search className="absolute left-2.5 top-2 text-muted" size={12} />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="premium-input pl-8 pr-3 py-1 text-xs w-full bg-bg border border-border rounded-lg text-text focus:outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="premium-input px-2 py-1 text-xs bg-bg border border-border rounded-lg text-text focus:outline-none"
              >
                <option value="all">All Events</option>
                <option value="connected">Connections</option>
                <option value="disconnected">Disconnections</option>
              </select>
            </div>
          </div>

          {/* Timeline content */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {logsLoading && logs.length === 0 ? (
              <div className="text-center py-20 text-muted">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-primary" />
                Loading activity logs...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted text-center">
                <Clock className="text-muted/10 mb-2" size={42} />
                <p className="font-bold text-xs">No connection activity logs found</p>
                <p className="text-[10px] text-muted max-w-[240px] mt-1">Logs will appear when mobile clients register, lock, unlock, or connect/disconnect from local WiFi.</p>
              </div>
            ) : (
              <div className="relative border-l border-border/40 pl-6 ml-3 space-y-4 py-2">
                {filteredLogs.map((log) => {
                  const isConnected = log.status === 'connected';
                  
                  return (
                    <div 
                      key={log.id} 
                      className={`relative p-3 rounded-xl border bg-bg/25 border-border hover:border-glass-border/30 transition-colors flex items-center justify-between gap-3`}
                    >
                      {/* Event dot */}
                      <div className={`absolute -left-[31px] top-4.5 w-2 h-2 rounded-full border-2 ${
                        isConnected 
                          ? 'bg-green border-green/60 shadow-[0_0_8px_rgba(34,197,94,0.4)]' 
                          : 'bg-red border-red/60 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                      }`} />

                      <div className="min-w-0">
                        <p className="text-xs font-bold text-text truncate">
                          {log.device_name} <span className="font-normal text-muted">({log.os})</span>
                        </p>
                        <p className="text-[9px] text-muted font-mono">{log.token}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider mb-1 border ${
                          isConnected 
                            ? 'bg-green/10 border-green/20 text-green' 
                            : 'bg-red/10 border-red/20 text-red'
                        }`}>
                          {log.status}
                        </span>
                        <p className="text-[9px] text-muted font-mono">{formatDate(log.timestamp)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
      
    </div>
  );
}
