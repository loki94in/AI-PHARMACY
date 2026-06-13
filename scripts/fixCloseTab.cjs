const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../frontend/src/pages/Purchases.tsx');
let content = fs.readFileSync(file, 'utf8');

const oldCloseTab = `  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;

    const filtered = tabs.filter(t => t.id !== tabId);`;

const newCloseTab = `  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!window.confirm('Are you sure you want to close this draft? Any unsaved data will be lost.')) {
      return;
    }

    if (tabs.length === 1) {
      const newId = 'bill_' + Date.now();
      const newTab = {
        id: newId,
        name: 'Bill 1',
        selectedDistributor: null,
        distributorSearch: '',
        invoiceNo: '',
        grnNo: \`GRN-\${new Date().getFullYear()}\${String(new Date().getMonth()+1).padStart(2, '0')}\${String(new Date().getDate()).padStart(2, '0')}-\${Math.floor(Math.random()*1000).toString().padStart(3, '0')}\`,
        invoiceDate: new Date().toISOString().split('T')[0],
        globalCdPer: 0,
        extraCredit: 0,
        items: [createEmptyItem()],
        sourceFilename: '',
        sourceFileHeaders: [],
        mappingConfig: {},
        editPurchaseId: null
      };
      
      setSelectedDistributor(null);
      setDistributorSearch('');
      setInvoiceNo('');
      setGrnNo(newTab.grnNo);
      setInvoiceDate(newTab.invoiceDate);
      setGlobalCdPer(0);
      setExtraCredit(0);
      setItems([createEmptyItem()]);
      setSourceFilename('');
      setSourceFileHeaders([]);
      setMappingConfig({});
      setEditPurchaseId(null);
      setActiveTabId(newId);
      setTabs([newTab]);
      return;
    }

    const filtered = tabs.filter(t => t.id !== tabId);`;

content = content.replace(oldCloseTab, newCloseTab);

const oldCloseButton = `{tabs.length > 1 && (
                    <span 
                      onClick={(e) => closeTab(t.id, e)}
                      className="hover:bg-white/15 rounded-full p-0.5 ml-1 transition-all cursor-pointer flex items-center justify-center text-muted hover:text-text"
                      title="Close Bill"
                    >
                      <X size={10} />
                    </span>
                  )}`;

const newCloseButton = `<span 
                      onClick={(e) => closeTab(t.id, e)}
                      className="hover:bg-white/15 rounded-full p-0.5 ml-1 transition-all cursor-pointer flex items-center justify-center text-muted hover:text-text"
                      title="Close Bill"
                    >
                      <X size={10} />
                    </span>`;

content = content.replace(oldCloseButton, newCloseButton);
fs.writeFileSync(file, content);
console.log("Updated closeTab");
