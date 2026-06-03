import React, { useState, useEffect } from 'react';
import { UploadCloud, Database, ArrowRight, CheckCircle, Loader2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { api } from '../services/api';

type Step = 1 | 2 | 3 | 4;

const Migration = () => {
  const [step, setStep] = useState<Step>(1);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2 State
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvSamples, setCsvSamples] = useState<any[]>([]);
  const [skipLines] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Step 3 State
  const [migrationStatus, setMigrationStatus] = useState<any>(null);
  const [stagingData, setStagingData] = useState<{inventory: any[], sales: any[], purchases: any[]}>({ inventory: [], sales: [], purchases: [] });
  const [isPolling, setIsPolling] = useState(false);

  // DB Target Columns
  const targetColumns = [
    { value: 'name', label: 'Medicine Name (Required)' },
    { value: 'batch_no', label: 'Batch Number' },
    { value: 'expiry_date', label: 'Expiry Date' },
    { value: 'quantity', label: 'Stock Quantity' },
    { value: 'mrp', label: 'MRP' },
    { value: 'cost_price', label: 'Cost Price' },
    { value: 'rack_location', label: 'Rack Location' },
    { value: 'invoice_no', label: 'Invoice No (Sales/Purchases)' },
    { value: 'date', label: 'Date (Sales/Purchases)' },
    { value: 'total_amount', label: 'Total Amount' },
    { value: 'patient_name', label: 'Patient / Customer Name' },
    { value: 'distributor_name', label: 'Distributor / Supplier Name' }
  ];

  useEffect(() => {
    let interval: any;
    if (isPolling) {
      interval = setInterval(() => {
        api.getMigrationStatus().then(status => {
          setMigrationStatus(status);
          if (status.isStagingReady) {
            setIsPolling(false);
            fetchStagingData();
          }
        }).catch(err => console.error(err));
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isPolling]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setIsUploading(true);
    setError(null);
    
    try {
      const res = await api.uploadMigrationFile(selectedFile);
      setUploadedFileName(res.file);
      setIsUploading(false);
      
      // Analyze file automatically
      setIsAnalyzing(true);
      const analysis = await api.analyzeMigrationFile(res.file, skipLines);
      if (analysis.isCsv) {
        setCsvHeaders(analysis.headers);
        setCsvSamples(analysis.samples);
        setStep(2);
      } else {
        setError("Uploaded file is not a valid CSV. Only CSVs support automatic mapping.");
      }
      setIsAnalyzing(false);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setIsUploading(false);
    }
  };

  const handleMappingChange = (header: string, targetValue: string) => {
    setMapping(prev => ({
      ...prev,
      [header]: targetValue
    }));
  };

  const startMigration = async () => {
    try {
      setError(null);
      await api.runMigration(uploadedFileName, mapping, skipLines);
      setStep(3);
      setIsPolling(true);
    } catch (err: any) {
      setError(err.message || 'Failed to start migration');
    }
  };

  const fetchStagingData = async () => {
    try {
      const [inv, sales, pur] = await Promise.all([
        api.getStagingInventory(),
        api.getStagingSales(),
        api.getStagingPurchases()
      ]);
      setStagingData({ inventory: inv, sales, purchases: pur });
    } catch (err) {
      console.error("Failed to fetch staging data", err);
    }
  };

  const finalizeMigration = async () => {
    try {
      setError(null);
      await api.finalizeMigration(false);
      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Failed to finalize migration');
    }
  };

  return (
    <div className="h-full flex flex-col fade-in space-y-6 overflow-y-auto pb-12">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight mb-2">Data Migration Wizard</h2>
        <p className="text-muted">Import data from your legacy software safely into the AI Pharmacy system.</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between glass-panel p-4 bg-black/40">
        {[
          { num: 1, label: 'Upload Data', icon: <UploadCloud size={16} /> },
          { num: 2, label: 'Map Columns', icon: <FileSpreadsheet size={16} /> },
          { num: 3, label: 'Review Staging', icon: <Database size={16} /> },
          { num: 4, label: 'Go Live', icon: <CheckCircle size={16} /> }
        ].map((s) => (
          <div key={s.num} className={`flex items-center gap-2 ${step >= s.num ? 'text-primary' : 'text-muted'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= s.num ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-white/5 border border-glass-border'}`}>
              {step > s.num ? <CheckCircle size={16} /> : s.num}
            </div>
            <span className="font-semibold hidden md:block">{s.label}</span>
            {s.num < 4 && <div className="w-8 md:w-16 h-px bg-glass-border mx-2"></div>}
          </div>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-bg text-red border border-red/20 rounded-xl flex items-center gap-2">
          <AlertTriangle size={20} />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* STEP 1: UPLOAD */}
      {step === 1 && (
        <div className="glass-panel p-12 flex flex-col items-center justify-center border-dashed border-2 border-primary/30">
          <UploadCloud size={64} className="text-primary/50 mb-6" />
          <h3 className="text-2xl font-bold mb-2">Upload your old software export</h3>
          <p className="text-muted mb-8 text-center max-w-md">
            We support CSV exports. Make sure your export contains the item names and quantities at minimum.
          </p>
          
          <label className="premium-btn bg-primary text-white cursor-pointer px-8 py-4 text-lg shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
            {isUploading ? <Loader2 className="animate-spin" /> : <Database />}
            {isUploading ? 'Uploading...' : 'Select CSV File'}
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={isUploading || isAnalyzing} />
          </label>
          {isAnalyzing && <p className="text-sky mt-4 animate-pulse">Analyzing CSV headers...</p>}
        </div>
      )}

      {/* STEP 2: MAPPING */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="glass-panel p-6">
            <h3 className="text-xl font-bold mb-4">Map your columns</h3>
            <p className="text-muted mb-6">Tell us what each column in your old CSV means in our new system.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {csvHeaders.map((header) => (
                <div key={header} className="p-4 bg-black/20 border border-glass-border rounded-xl flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-sky">{header}</span>
                    <p className="text-xs text-muted mt-1 truncate max-w-[200px]">
                      Sample: {csvSamples[0]?.[header] || 'N/A'}
                    </p>
                  </div>
                  <ArrowRight size={16} className="text-muted mx-2" />
                  <select 
                    className="premium-input bg-black/50 text-sm py-2"
                    value={mapping[header] || ''}
                    onChange={(e) => handleMappingChange(header, e.target.value)}
                    title={`Map ${header} to column`}
                    aria-label={`Map ${header} to column`}
                  >
                    <option value="">-- Ignore Column --</option>
                    {targetColumns.map(col => (
                      <option key={col.value} value={col.value}>{col.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <button 
                onClick={startMigration}
                className="premium-btn bg-primary text-white flex items-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                disabled={!Object.values(mapping).includes('name')} // Require name mapped
              >
                Start Migration <ArrowRight size={16} />
              </button>
            </div>
            {!Object.values(mapping).includes('name') && (
              <p className="text-amber text-xs text-right mt-2 font-semibold">You must map at least 'Medicine Name' to proceed.</p>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: REVIEW STAGING */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="glass-panel p-6 border-sky/30">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">Migration Progress</h3>
                <p className="text-sky font-semibold mt-1">{migrationStatus?.message || 'Starting...'}</p>
              </div>
              {isPolling && <Loader2 className="animate-spin text-primary" size={32} />}
            </div>
          </div>

          {!isPolling && migrationStatus?.isStagingReady && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="glass-panel p-6 border-amber/30">
                <h3 className="text-xl font-bold text-amber flex items-center gap-2 mb-2">
                  <AlertTriangle /> Staging Area Review
                </h3>
                <p className="text-muted mb-6">
                  This data is safely staged in a temporary database. It is NOT live yet. Review it carefully before finalizing.
                </p>

                <div className="flex gap-4 mb-4 border-b border-glass-border pb-4">
                  <div className="p-4 bg-black/30 rounded-xl flex-1 text-center border border-glass-border">
                    <span className="text-3xl font-black text-sky block">{stagingData.inventory.length}</span>
                    <span className="text-xs uppercase font-bold text-muted tracking-wider">Inventory Items</span>
                  </div>
                  <div className="p-4 bg-black/30 rounded-xl flex-1 text-center border border-glass-border">
                    <span className="text-3xl font-black text-green block">{stagingData.sales.length}</span>
                    <span className="text-xs uppercase font-bold text-muted tracking-wider">Sales Invoices</span>
                  </div>
                  <div className="p-4 bg-black/30 rounded-xl flex-1 text-center border border-glass-border">
                    <span className="text-3xl font-black text-primary block">{stagingData.purchases.length}</span>
                    <span className="text-xs uppercase font-bold text-muted tracking-wider">Purchase Bills</span>
                  </div>
                </div>

                <div className="overflow-auto max-h-64 border border-glass-border rounded-xl bg-black/20">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#18181b]/95 sticky top-0">
                      <tr>
                        <th className="p-3 text-muted">Staged Medicine</th>
                        <th className="p-3 text-muted">Batch</th>
                        <th className="p-3 text-muted">Stock Qty</th>
                        <th className="p-3 text-muted">MRP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stagingData.inventory.slice(0, 10).map(i => (
                        <tr key={i.id} className="border-b border-glass-border hover:bg-white/5">
                          <td className="p-3 font-semibold">{i.medicine_name}</td>
                          <td className="p-3">{i.batch_no || '-'}</td>
                          <td className="p-3 font-bold text-sky">{i.quantity}</td>
                          <td className="p-3">₹{i.mrp}</td>
                        </tr>
                      ))}
                      {stagingData.inventory.length > 10 && (
                        <tr><td colSpan={4} className="p-3 text-center text-muted italic">...and {stagingData.inventory.length - 10} more rows</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 flex justify-end gap-4">
                  <button onClick={() => setStep(1)} className="premium-btn btn-outline text-muted">Cancel Migration</button>
                  <button onClick={finalizeMigration} className="premium-btn bg-green text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                    <Database className="mr-2 inline" size={18} /> Finalize & Go Live
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 4 && (
        <div className="glass-panel p-12 flex flex-col items-center justify-center border-2 border-green/30 animate-fade-in-up text-center">
          <div className="w-24 h-24 rounded-full bg-green/20 flex items-center justify-center mb-6">
            <CheckCircle size={48} className="text-green" />
          </div>
          <h3 className="text-3xl font-black mb-2 text-white">Migration Complete!</h3>
          <p className="text-muted text-lg max-w-lg mb-8">
            Your old data has been perfectly merged into the live AI Pharmacy relational database. All stock logic, POS billing, and reports are now connected to the migrated data.
          </p>
          <a href="/" className="premium-btn bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:scale-105 transition-all text-lg px-8 py-3">
            Go to Dashboard
          </a>
        </div>
      )}

    </div>
  );
};

export default Migration;
