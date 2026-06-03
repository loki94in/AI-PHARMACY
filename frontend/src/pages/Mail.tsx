import { useState, useEffect } from 'react';
import { 
  Mail as MailIcon, 
  FolderOpen, 
  RefreshCw, 
  CheckCircle, 
  Calendar, 
  Paperclip, 
  User, 
  ArrowRight,
  Import,
  Loader
} from 'lucide-react';
import { api } from '../services/api';

interface EmailRecord {
  id?: number;
  from: string;
  subject: string;
  body: string;
  date?: string;
  attachments?: any[];
}

interface AttachmentFile {
  filename: string;
  size: number;
  createdAt: string;
}

const Mail = () => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'attachments'>('inbox');
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsingFile, setParsingFile] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importForm, setImportForm] = useState({
    from: '',
    subject: '',
    body: '',
  });
  const [importing, setImporting] = useState(false);

  const fetchInbox = () => {
    setLoading(true);
    api.getEmailInbox()
      .then((data: any) => {
        if (Array.isArray(data)) {
          setEmails(data);
        }
      })
      .catch((err: any) => console.error('Error fetching email inbox:', err))
      .finally(() => setLoading(false));
  };

  const fetchAttachments = () => {
    api.getEmailAttachments()
      .then((data: any) => {
        if (Array.isArray(data)) {
          setAttachments(data);
        }
      })
      .catch((err: any) => console.error('Error fetching attachments:', err));
  };

  useEffect(() => {
    fetchInbox();
    fetchAttachments();
  }, []);

  const handleParseAttachment = (filename: string) => {
    setParsingFile(filename);
    api.parseAttachment(filename)
      .then(() => {
        alert(`Invoice file "${filename}" parsed successfully!\nStock details imported atomically into SQLite database.`);
        fetchAttachments();
      })
      .catch((err: any) => {
        console.error('Error parsing attachment:', err);
        alert('Failed to parse attachment. Please check file format compliance.');
      })
      .finally(() => setParsingFile(null));
  };

  const handleManualImport = () => {
    if (!importForm.from || !importForm.subject) {
      alert('Sender (From) and Subject are required!');
      return;
    }
    setImporting(true);
    api.importManualEmail(importForm)
      .then(() => {
        alert('distributor email manual import triggered! SQLite database updated.');
        setShowImportModal(false);
        setImportForm({ from: '', subject: '', body: '' });
        fetchInbox();
      })
      .catch((err: any) => {
        console.error('Error manually importing email:', err);
        alert('Failed to manually trigger email import.');
      })
      .finally(() => setImporting(false));
  };

  return (
    <div className="h-full flex flex-col fade-in space-y-5 overflow-hidden pb-4">
      {/* Top Header Card */}
      <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-4 bg-white/5 border-glass-border">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-text flex items-center gap-2">
            <MailIcon size={20} className="text-primary" />
            Distributor Mail Parser Hub
          </h3>
          <p className="text-xs text-muted">
            Polled background email inbox parser. Automatically extracts distributor invoice attachments and alerts delivery boys.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green/10 border border-green/20 text-xs text-green font-bold select-none">
            <span className="h-2 w-2 bg-green rounded-full animate-ping" />
            IMAP STATUS: ONLINE (5m interval)
          </div>
          <button 
            onClick={() => { fetchInbox(); fetchAttachments(); }}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-glass-border/60 text-text transition-all flex items-center gap-2 text-xs font-semibold"
            title="Refresh Inbox & Files"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Sync Mailbox
          </button>
          <button 
            onClick={() => setShowImportModal(true)}
            className="premium-btn bg-primary text-text shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:bg-blue-600 text-xs py-1.5 px-4 font-bold uppercase tracking-wider"
          >
            <Import size={14} /> Import Manual
          </button>
        </div>
      </div>

      {/* Main Container Tabs */}
      <div className="flex gap-4 p-1 border-b border-glass-border bg-black/20 rounded-xl max-w-sm">
        <button
          onClick={() => setActiveTab('inbox')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'inbox' ? 'bg-primary text-text shadow' : 'text-muted hover:text-text'}`}
        >
          <MailIcon size={14} /> Inbox Emails ({emails.length})
        </button>
        <button
          onClick={() => setActiveTab('attachments')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === 'attachments' ? 'bg-primary text-text shadow' : 'text-muted hover:text-text'}`}
        >
          <Paperclip size={14} /> Scanned Invoices ({attachments.length})
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-5 overflow-hidden">
        {/* LEFT/MAIN GRID: Tab Contents (inbox or attachments folder list) */}
        <div className="lg:col-span-2 glass-panel flex flex-col overflow-hidden bg-white/5 border-glass-border">
          {activeTab === 'inbox' ? (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="p-3 border-b border-glass-border bg-black/10 text-xs font-bold text-muted uppercase tracking-wider select-none">
                Distributor Emails Pending Review:
              </div>
              <div className="flex-1 overflow-y-auto bg-black/10 divide-y divide-glass-border/20">
                {loading ? (
                  <div className="p-12 text-center text-muted flex flex-col items-center gap-3">
                    <Loader className="animate-spin text-primary" size={24} />
                    <span className="text-xs uppercase font-semibold animate-pulse">Syncing distributor mailbox...</span>
                  </div>
                ) : emails.length === 0 ? (
                  <div className="p-16 text-center text-muted flex flex-col items-center gap-2 italic text-xs">
                    <CheckCircle size={28} className="text-green opacity-80" />
                    No distributor emails pending review. IMAP Poller is synced!
                  </div>
                ) : (
                  emails.map((email, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedEmail(email)}
                      className={`w-full text-left p-4 hover:bg-white/5 transition-all flex items-start gap-4 ${selectedEmail?.id === email.id ? 'bg-primary/5 border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
                    >
                      <div className="p-2 rounded-xl bg-white/5 text-primary border border-glass-border flex-shrink-0">
                        <MailIcon size={16} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-text truncate flex items-center gap-1">
                            <User size={12} className="text-muted" /> {email.from}
                          </span>
                          <span className="text-[10px] text-muted font-mono flex items-center gap-1">
                            <Calendar size={10} /> {email.date ? new Date(email.date).toLocaleDateString() : 'Today'}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-sky truncate">{email.subject}</h4>
                        <p className="text-[11px] text-muted truncate">{email.body || '(No preview content available)'}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="p-3 border-b border-glass-border bg-black/10 text-xs font-bold text-muted uppercase tracking-wider select-none">
                Distributor Scanned Invoice Files Folder (`/uploads`):
              </div>
              <div className="flex-1 overflow-y-auto bg-black/10 divide-y divide-glass-border/20">
                {attachments.length === 0 ? (
                  <div className="p-16 text-center text-muted flex flex-col items-center gap-2 italic text-xs">
                    <FolderOpen size={28} className="text-sky opacity-80" />
                    No Excel/CSV invoice attachments found in folder.
                  </div>
                ) : (
                  attachments.map((file, idx) => (
                    <div key={idx} className="p-4 hover:bg-white/5 transition-all flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="p-2 rounded-xl bg-white/5 text-sky border border-glass-border flex-shrink-0">
                          <Paperclip size={16} />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-text truncate block">{file.filename}</span>
                          <span className="text-[10px] text-muted font-mono block mt-0.5">Size: {(file.size / 1024).toFixed(1)} KB | Uploaded: {new Date(file.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleParseAttachment(file.filename)}
                        disabled={parsingFile === file.filename}
                        className={`text-xs font-bold uppercase tracking-wider rounded-lg px-4 py-2 border flex items-center gap-1.5 transition-all ${
                          parsingFile === file.filename 
                            ? 'bg-sky/10 border-sky/30 text-sky cursor-wait' 
                            : 'bg-green/10 border-green/30 text-green hover:bg-green/20 hover:shadow-[0_2px_8px_rgba(16,185,129,0.1)]'
                        }`}
                      >
                        {parsingFile === file.filename ? (
                          <>
                            <Loader size={12} className="animate-spin" />
                            Parsing...
                          </>
                        ) : (
                          <>
                            <CheckCircle size={12} />
                            Parse & Stock
                          </>
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT WIDGET GRID: Email Detail Display or Folder Activity log */}
        <div className="lg:col-span-1 glass-panel p-5 flex flex-col bg-white/5 border-glass-border overflow-hidden">
          {selectedEmail ? (
            <div className="flex flex-col h-full overflow-hidden space-y-4">
              {/* Header Details */}
              <div className="border-b border-glass-border pb-3 space-y-2 flex-shrink-0">
                <div className="flex justify-between items-start gap-2">
                  <h4 className="text-xs font-bold text-sky uppercase tracking-wide">Email Record Details</h4>
                  <button 
                    onClick={() => setSelectedEmail(null)}
                    className="text-[10px] font-bold text-muted hover:text-text hover:bg-white/5 px-2 py-0.5 rounded border border-glass-border/30"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-1 text-xs">
                  <div>
                    <span className="font-bold text-muted mr-1.5">From:</span>
                    <span className="font-semibold text-text">{selectedEmail.from}</span>
                  </div>
                  <div>
                    <span className="font-bold text-muted mr-1.5">Subject:</span>
                    <span className="font-semibold text-text">{selectedEmail.subject}</span>
                  </div>
                  <div>
                    <span className="font-bold text-muted mr-1.5">Date:</span>
                    <span className="font-mono text-muted">{selectedEmail.date ? new Date(selectedEmail.date).toLocaleString() : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Body Content */}
              <div className="flex-1 overflow-y-auto bg-black/20 p-3.5 rounded-xl border border-glass-border/30 text-xs font-sans text-gray-300 leading-relaxed whitespace-pre-wrap">
                {selectedEmail.body || '(No body content logged)'}
              </div>

              {/* Action Operations */}
              <div className="pt-2 border-t border-glass-border flex flex-col gap-2.5 flex-shrink-0">
                <button
                  onClick={() => alert(`Distributor Boy alerted successfully via SMS/Telegram for ${selectedEmail.from} order!`)}
                  className="w-full premium-btn bg-white/5 border border-glass-border/80 text-text hover:text-white hover:bg-white/10 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  <ArrowRight size={13} className="text-primary" /> Alert Delivery Boy
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full justify-center items-center text-center space-y-4 py-8">
              <div className="p-4 rounded-full bg-white/5 text-muted border border-glass-border/40 animate-pulse">
                <MailIcon size={32} className="opacity-80" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-text">Select Email Record</h4>
                <p className="text-xs text-muted max-w-[200px] leading-relaxed">
                  Click on any distributor email from the list to display its complete body text, log stats, and trigger alerts.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Email Webhook Simulation Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-panel max-w-md w-full p-6 space-y-5 border-glass-border bg-[#18181b]/95 shadow-2xl rounded-2xl relative">
            <div className="flex justify-between items-center border-b border-glass-border pb-3">
              <h3 className="font-bold flex items-center gap-2 text-base text-text">
                <Import size={18} className="text-primary" />
                Manually Import Email / Invoice
              </h3>
              <button 
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-muted hover:text-text transition-all"
              >
                <XCircleIcon size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-muted uppercase tracking-wider block">Distributor (From) *</label>
                <input 
                  type="email" 
                  className="premium-input w-full text-xs font-mono" 
                  placeholder="distributor@pharma.com"
                  value={importForm.from}
                  onChange={e => setImportForm({...importForm, from: e.target.value})}
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-muted uppercase tracking-wider block">Subject *</label>
                <input 
                  type="text" 
                  className="premium-input w-full text-xs" 
                  placeholder="e.g. Invoice for Dolo 650 Batch B-34"
                  value={importForm.subject}
                  onChange={e => setImportForm({...importForm, subject: e.target.value})}
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-muted uppercase tracking-wider block">Email Body / Purchase details</label>
                <textarea 
                  rows={4}
                  className="premium-input w-full text-xs font-sans" 
                  placeholder="Enter invoice details or body text..."
                  value={importForm.body}
                  onChange={e => setImportForm({...importForm, body: e.target.value})}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-glass-border flex justify-end gap-3">
              <button 
                onClick={() => setShowImportModal(false)}
                className="premium-btn bg-white/5 border border-glass-border text-muted hover:text-text hover:bg-white/10 text-xs font-bold uppercase tracking-wider py-1.5 px-4"
              >
                Cancel
              </button>
              <button 
                onClick={handleManualImport}
                disabled={importing || !importForm.from || !importForm.subject}
                className="premium-btn bg-primary text-text shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:bg-blue-600 text-xs font-bold uppercase tracking-wider py-1.5 px-5"
              >
                {importing ? 'Importing...' : 'Trigger Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Simple visual X icon helper
const XCircleIcon = ({ size }: { size: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x-circle text-muted hover:text-text transition-colors">
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6" />
    <path d="m9 9 6 6" />
  </svg>
);

export default Mail;
