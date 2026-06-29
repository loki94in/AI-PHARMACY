const fs = require('fs');
const file = 'e:/CURRENT PROJECT ON WORKING/AI PHARMACY/frontend/src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove Topbar states and unified poll logic
content = content.replace(
`  const [flashToast, setFlashToast] = useState<(ToastEventDetail & { id: number }) | null>(null);
  const [catalogJob, setCatalogJob] = useState<{
    id: number;
    status: string;
    progress: number;
    total_count?: number;
    processed_count?: number;
  } | null>(null);

  const [orderAlertCount, setOrderAlertCount] = useState(0);

  // ─── Global sync state ───────────────────────────────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const globalSyncingRef = useRef(false);

  // ─── Unified background poll — 60 s ──────────────────────────────────────
  // Replaces 4 separate 30s intervals (getOrders, /jobs, /notifications/devices,
  // getRefills+getAutomationNotifications+getReconciliationList).
  // All fetches run as one Promise.allSettled so a slow endpoint never blocks others.
  const runGlobalSync = useCallback(async () => {
    if (document.hidden || globalSyncingRef.current) return;
    globalSyncingRef.current = true;
    try {
      const [ordersRes, jobsRes, devicesRes, refillRes, notifRes, reconRes] = await Promise.allSettled([
        api.getOrders(),
        apiClient.get('/jobs'),
        apiClient.get('/notifications/devices'),
        api.getRefills(),
        api.getAutomationNotifications({ status: 'staged' }),
        api.getReconciliationList(),
      ]);

      if (ordersRes.status === 'fulfilled') {
        const orders = ordersRes.value;
        setOrderAlertCount(Array.isArray(orders)
          ? orders.filter((o: any) => o.status === 'Pending' || o.status === 'Ordered').length
          : 0);
      }
      if (jobsRes.status === 'fulfilled') {
        const { data } = jobsRes.value as any;
        if (Array.isArray(data)) {
          const activeJob = data.find((j: any) => ['processing', 'pending', 'pending_analysis', 'processing_analysis'].includes(j.status));
          setCatalogJob(activeJob ? {
            id: activeJob.id,
            status: activeJob.status,
            progress: activeJob.progress || 0,
            total_count: activeJob.total_count,
            processed_count: activeJob.processed_count
          } : null);
        }
      }
      if (devicesRes.status === 'fulfilled') {
        const { data } = devicesRes.value as any;
        if (data && Array.isArray(data.devices)) setConnectedDevices(data.devices);
      }
      if (refillRes.status === 'fulfilled') {
        setRefills(Array.isArray(refillRes.value) ? refillRes.value : []);
      }
      if (notifRes.status === 'fulfilled') {
        setStagedNotifications(Array.isArray(notifRes.value) ? notifRes.value : []);
      }
      if (reconRes.status === 'fulfilled') {
        setReconciliationList(Array.isArray(reconRes.value) ? reconRes.value : []);
      }
    } catch (err) {
      console.warn('Global sync error:', err);
    } finally {
      globalSyncingRef.current = false;
    }
  }, []);

  // Manual sync — exposed to header button + window event
  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await runGlobalSync();
      await fetchStagedCounts(true);
    } finally {
      setTimeout(() => setIsSyncing(false), 600); // minimum spin so it feels responsive
    }
  }, [isSyncing, runGlobalSync, fetchStagedCounts]);

  useEffect(() => {
    runGlobalSync();
    const interval = setInterval(runGlobalSync, 60_000); // 60 s — was four separate 30s loops

    const handleRefresh = () => { runGlobalSync(); };
    window.addEventListener('refresh-pharmarack-cart', handleRefresh);
    window.addEventListener('refresh-special-orders', handleRefresh);
    (window as any).manualSync = handleManualSync;

    return () => {
      clearInterval(interval);
      window.removeEventListener('refresh-pharmarack-cart', handleRefresh);
      window.removeEventListener('refresh-special-orders', handleRefresh);
      delete (window as any).manualSync;
    };
  }, [runGlobalSync, handleManualSync]);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [connectedDevices, setConnectedDevices] = useState<{ token: string; device_name: string; os: string; is_online: number; last_seen: string; offline_seconds?: number }[]>([]);`,
`  const [flashToast, setFlashToast] = useState<(ToastEventDetail & { id: number }) | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);`
);

// 2. Add Topbar props
content = content.replace(
`  refillAlertCount?: number;
}) => {`,
`  refillAlertCount?: number;
  orderAlertCount: number;
  catalogJob: any;
  isSyncing: boolean;
  onManualSync: () => void;
  connectedDevices: any[];
  setConnectedDevices: React.Dispatch<React.SetStateAction<any[]>>;
}) => {`
);

// 3. Move them to Layout, right before fetchRefillData
const statesToInject = `  const [catalogJob, setCatalogJob] = useState<{
    id: number;
    status: string;
    progress: number;
    total_count?: number;
    processed_count?: number;
  } | null>(null);
  const [orderAlertCount, setOrderAlertCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const globalSyncingRef = useRef(false);
  const [connectedDevices, setConnectedDevices] = useState<{ token: string; device_name: string; os: string; is_online: number; last_seen: string; offline_seconds?: number }[]>([]);

  // ─── Unified background poll — 60 s ──────────────────────────────────────
  const runGlobalSync = useCallback(async () => {
    if (document.hidden || globalSyncingRef.current) return;
    globalSyncingRef.current = true;
    try {
      const [ordersRes, jobsRes, devicesRes, refillRes, notifRes, reconRes] = await Promise.allSettled([
        api.getOrders(),
        apiClient.get('/jobs'),
        apiClient.get('/notifications/devices'),
        api.getRefills(),
        api.getAutomationNotifications({ status: 'staged' }),
        api.getReconciliationList(),
      ]);

      if (ordersRes.status === 'fulfilled') {
        const orders = ordersRes.value;
        setOrderAlertCount(Array.isArray(orders)
          ? orders.filter((o: any) => o.status === 'Pending' || o.status === 'Ordered').length
          : 0);
      }
      if (jobsRes.status === 'fulfilled') {
        const { data } = jobsRes.value as any;
        if (Array.isArray(data)) {
          const activeJob = data.find((j: any) => ['processing', 'pending', 'pending_analysis', 'processing_analysis'].includes(j.status));
          setCatalogJob(activeJob ? {
            id: activeJob.id,
            status: activeJob.status,
            progress: activeJob.progress || 0,
            total_count: activeJob.total_count,
            processed_count: activeJob.processed_count
          } : null);
        }
      }
      if (devicesRes.status === 'fulfilled') {
        const { data } = devicesRes.value as any;
        if (data && Array.isArray(data.devices)) setConnectedDevices(data.devices);
      }
      if (refillRes.status === 'fulfilled') {
        setRefills(Array.isArray(refillRes.value) ? refillRes.value : []);
      }
      if (notifRes.status === 'fulfilled') {
        setStagedNotifications(Array.isArray(notifRes.value) ? notifRes.value : []);
      }
      if (reconRes.status === 'fulfilled') {
        setReconciliationList(Array.isArray(reconRes.value) ? reconRes.value : []);
      }
    } catch (err) {
      console.warn('Global sync error:', err);
    } finally {
      globalSyncingRef.current = false;
    }
  }, []);
`;

content = content.replace(
`  // fetchRefillData logic is now inside runGlobalSync (60s unified loop).
  // Kept as alias for legacy call-sites (refill panel open, refill actions).
  const fetchRefillData = useCallback(() => runGlobalSync(), [runGlobalSync]);`,
statesToInject + `\n  const fetchRefillData = useCallback(() => runGlobalSync(), [runGlobalSync]);`
);

const useEffectsToInject = `  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await runGlobalSync();
      await fetchStagedCounts(true);
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  }, [isSyncing, runGlobalSync, fetchStagedCounts]);

  useEffect(() => {
    runGlobalSync();
    const interval = setInterval(runGlobalSync, 60_000);

    const handleRefresh = () => { runGlobalSync(); };
    window.addEventListener('refresh-pharmarack-cart', handleRefresh);
    window.addEventListener('refresh-special-orders', handleRefresh);
    (window as any).manualSync = handleManualSync;

    return () => {
      clearInterval(interval);
      window.removeEventListener('refresh-pharmarack-cart', handleRefresh);
      window.removeEventListener('refresh-special-orders', handleRefresh);
      delete (window as any).manualSync;
    };
  }, [runGlobalSync, handleManualSync]);
`;

content = content.replace(
`  // Page visibility: when user returns to the tab, run full sync immediately
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        runGlobalSync();
        fetchStagedCounts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [runGlobalSync, fetchStagedCounts]);`,
useEffectsToInject + `\n  // Page visibility: when user returns to the tab, run full sync immediately
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        runGlobalSync();
        fetchStagedCounts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [runGlobalSync, fetchStagedCounts]);`
);


// 5. Add the props to the Topbar instance in Layout
content = content.replace(
`          onOpenConnectModal={() => setShowConnectModal(true)}
          refillAlertCount={refills.filter(r => r.is_active === 1 && r.status === 'pending' && r.hold_for_stock === 1).length}
        />`,
`          onOpenConnectModal={() => setShowConnectModal(true)}
          refillAlertCount={refills.filter(r => r.is_active === 1 && r.status === 'pending' && r.hold_for_stock === 1).length}
          orderAlertCount={orderAlertCount}
          catalogJob={catalogJob}
          isSyncing={isSyncing}
          onManualSync={handleManualSync}
          connectedDevices={connectedDevices}
          setConnectedDevices={setConnectedDevices}
        />`
);

fs.writeFileSync(file, content);
console.log('App.tsx updated.');
