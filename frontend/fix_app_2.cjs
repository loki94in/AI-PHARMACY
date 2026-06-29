const fs = require('fs');
const file = 'e:/CURRENT PROJECT ON WORKING/AI PHARMACY/frontend/src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
`  onMarkRead,
  onOpenStagedReview,
  onOpenConnectModal,
  refillAlertCount = 0,
}: {`,
`  onMarkRead,
  onOpenStagedReview,
  onOpenConnectModal,
  refillAlertCount = 0,
  orderAlertCount,
  catalogJob,
  isSyncing,
  onManualSync,
  connectedDevices,
  setConnectedDevices,
}: {`
);

// We need to replace `handleManualSync` with `onManualSync` in Topbar, but NOT in Layout.
// Topbar ends around line 1500. So let's just do string replacement carefully.
// Wait, in Topbar, it's used at: `onClick={handleManualSync}`
content = content.replace(`onClick={handleManualSync}`, `onClick={onManualSync}`);

// We also need to fix `setCatalogJob` in Topbar. It is used in 3 places. Wait, Topbar doesn't HAVE setCatalogJob!
// Oh! Topbar calls `setCatalogJob(null)` and `setCatalogJob(prev => ...)` when closing the catalog job popup?
// Let me check where `setCatalogJob` is used in Topbar!
// src/App.tsx(684,13): error TS2304: Cannot find name 'setCatalogJob'.
// src/App.tsx(700,15): error TS2304: Cannot find name 'setCatalogJob'.
// src/App.tsx(702,15): error TS2304: Cannot find name 'setCatalogJob'.
