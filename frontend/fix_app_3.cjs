const fs = require('fs');
const file = 'e:/CURRENT PROJECT ON WORKING/AI PHARMACY/frontend/src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add setCatalogJob to props type
content = content.replace(
`  setConnectedDevices: React.Dispatch<React.SetStateAction<any[]>>;
}) => {`,
`  setConnectedDevices: React.Dispatch<React.SetStateAction<any[]>>;
  setCatalogJob: React.Dispatch<React.SetStateAction<any>>;
}) => {`
);

// Destructure the props
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
  setCatalogJob,
}: {`
);

// Pass setCatalogJob to Topbar in Layout
content = content.replace(
`          setConnectedDevices={setConnectedDevices}
        />`,
`          setConnectedDevices={setConnectedDevices}
          setCatalogJob={setCatalogJob}
        />`
);

// Replace handleManualSync with onManualSync in Topbar's render
// Since Topbar has onClick={handleManualSync}, we can just replace it.
content = content.replace(`onClick={handleManualSync}`, `onClick={onManualSync}`);

fs.writeFileSync(file, content);
console.log('Fixed destructured props in App.tsx');
