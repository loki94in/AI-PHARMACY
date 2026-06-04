import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail as MailIcon,
  RefreshCw,
  CheckCircle,
  Calendar,
  Paperclip,
  User,
  FileText,
  Loader,
  File,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../services/api';

interface EmailRecord {
  id?: number;
  from: string;
  subject: string;
  body: string;
  date?: string;
  attachments?: any[];
  distributorName?: string;
}

interface AttachmentFile {
  filename: string;
  size: number;
  contentType?: string;
  createdAt?: string;
  isSelected: boolean;
}

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  csv: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  txt: File,
};

const FILE_COLORS: Record<string, string> = {
  pdf: 'text-red',
  csv: 'text-green',
  xlsx: 'text-green',
  xls: 'text-green',
  txt: 'text-muted',
};

function getFileExt(filename: string) {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const Mail = () => {
  const navigate = useNavigate();
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<any>(null);

  const fetchInbox = useCallback(() => {
    setLoading(true);
    api
      .getEmailInbox()
      .then((data: any) => {
        if (Array.isArray(data)) setEmails(data);
      })
      .catch((err: any) => console.error('Error fetching email inbox:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const handleSelectEmail = (email: EmailRecord) => {
    setSelectedEmail(email);
    setAttachments([]);
    setProcessResult(null);
    if (!email.id) return;

    setLoadingAttachments(true);
    api
      .getEmailAttachmentsById(email.id)
      .then((data: any) => {
        if (Array.isArray(data)) {
          setAttachments(data.map((a: any) => ({ ...a, isSelected: false })));
        }
      })
      .catch((err: any) => console.error('Error fetching attachments:', err))
      .finally(() => setLoadingAttachments(false));
  };

  const toggleAttachment = (filename: string) => {
    setAttachments((prev) =>
      prev.map((a) => (a.filename === filename ? { ...a, isSelected: !a.isSelected } : a))
    );
  };

  const selectAll = () => setAttachments((prev) => prev.map((a) => ({ ...a, isSelected: true })));
  const clearAll = () => setAttachments((prev) => prev.map((a) => ({ ...a, isSelected: false })));
  const selectPdfOnly = () =>
    setAttachments((prev) => prev.map((a) => ({ ...a, isSelected: getFileExt(a.filename) === 'pdf' })));
  const selectCsvOnly = () =>
    setAttachments((prev) =>
      prev.map((a) => {
        const ext = getFileExt(a.filename);
        return { ...a, isSelected: ext === 'csv' || ext === 'xlsx' || ext === 'xls' };
      })
    );

  const selectedCount = attachments.filter((a) => a.isSelected).length;

  const handleProcess = async () => {
    if (!selectedEmail || selectedCount === 0) return;
    setProcessing(true);
    setProcessResult(null);
    try {
      const selectedFiles = attachments.filter((a) => a.isSelected);
      const allItems: any[] = [];
      const results: any[] = [];

      for (const file of selectedFiles) {
        // Parse the attachment but do NOT directly commit/import it to the database inventory
        const res = await api.parseAttachment(file.filename, false);
        results.push({ filename: file.filename, ...res });
        if (res && res.success && Array.isArray(res.items)) {
          allItems.push(...res.items);
        }
      }

      setProcessResult(results);

      if (allItems.length === 0) {
        alert('No items could be parsed from the selected attachment(s).');
        return;
      }

      // Extract invoice no if match found
      const invoiceNoMatch = selectedEmail.subject.match(/INV-\d+-\d+/i) || selectedEmail.subject.match(/\b([A-Z0-9_\-\/]{4,15})\b/);

      // Navigate to Purchases (Manual Entry) and pass the prefilled data
      navigate('/manual-purchase', {
        state: {
          prefilledPurchase: {
            distributorName: selectedEmail.distributorName || '',
            invoiceNo: invoiceNoMatch ? invoiceNoMatch[0] : '',
            date: selectedEmail.date ? new Date(selectedEmail.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            items: allItems.map(item => ({
              medicine_name: item.name || '',
              qty: item.quantity || 0,
              free_qty: item.free_qty || 0,
              rate: item.rate || 0,
              mrp: item.mrp || 0,
              batch_no: item.batch_no || '',
              expiry_date: item.expiry_date || '',
            }))
          }
        }
      });
    } catch (err: any) {
      console.error('Error processing attachments:', err);
      alert('Failed to process one or more files.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col fade-in space-y-4 overflow-hidden pb-4">
      {/* Header */}
      <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-4 bg-white/5 border-glass-border">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-text flex items-center gap-2">
            <MailIcon size={20} className="text-primary" />
            Distributor Mail Inbox
          </h3>
          <p className="text-xs text-muted">
            Select an email to view attachments, then pick files to create a purchase bill.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green/10 border border-green/20 text-xs text-green font-bold select-none">
            <span className="h-2 w-2 bg-green rounded-full animate-ping" />
            IMAP: ONLINE
          </div>
          <button
            onClick={fetchInbox}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-glass-border/60 text-text transition-all flex items-center gap-2 text-xs font-semibold"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Two-Panel Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 overflow-hidden">
        {/* LEFT: Email List */}
        <div className="lg:col-span-3 glass-panel flex flex-col overflow-hidden bg-white/5 border-glass-border">
          <div className="p-3 border-b border-glass-border bg-black/10 text-xs font-bold text-muted uppercase tracking-wider select-none flex items-center justify-between">
            <span>Inbox Emails ({emails.length})</span>
            {selectedEmail && (
              <button
                onClick={() => { setSelectedEmail(null); setAttachments([]); setProcessResult(null); }}
                className="text-primary hover:text-blue-400 normal-case tracking-normal"
              >
                Clear Selection
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto bg-black/10 divide-y divide-glass-border/20">
            {loading ? (
              <div className="p-12 text-center text-muted flex flex-col items-center gap-3">
                <Loader className="animate-spin text-primary" size={24} />
                <span className="text-xs uppercase font-semibold animate-pulse">Syncing mailbox...</span>
              </div>
            ) : emails.length === 0 ? (
              <div className="p-16 text-center text-muted flex flex-col items-center gap-2 italic text-xs">
                <CheckCircle size={28} className="text-green opacity-80" />
                No emails in inbox. IMAP poller is synced!
              </div>
            ) : (
              emails.map((email, idx) => (
                <button
                  key={email.id || idx}
                  onClick={() => handleSelectEmail(email)}
                  className={`w-full text-left p-4 hover:bg-white/5 transition-all flex items-start gap-3 ${
                    selectedEmail?.id === email.id
                      ? 'bg-primary/5 border-l-2 border-primary'
                      : 'border-l-2 border-transparent'
                  }`}
                >
                  <div className="p-2 rounded-xl bg-white/5 text-primary border border-glass-border flex-shrink-0 mt-0.5">
                    <MailIcon size={16} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-text truncate flex items-center gap-1">
                        <User size={12} className="text-muted" /> {email.from}
                      </span>
                      <span className="text-[10px] text-muted font-mono flex items-center gap-1 flex-shrink-0">
                        <Calendar size={10} />
                        {email.date ? new Date(email.date).toLocaleDateString() : 'Today'}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-sky truncate">{email.subject}</h4>
                    <p className="text-[11px] text-muted truncate">
                      {email.body || '(No preview)'}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Email Details + Attachments */}
        <div className="lg:col-span-2 glass-panel flex flex-col bg-white/5 border-glass-border overflow-hidden">
          {selectedEmail ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Email Header */}
              <div className="p-4 border-b border-glass-border space-y-2 flex-shrink-0">
                <div className="flex justify-between items-start gap-2">
                  <h4 className="text-xs font-bold text-sky uppercase tracking-wide">Email Details</h4>
                  <button
                    onClick={() => { setSelectedEmail(null); setAttachments([]); setProcessResult(null); }}
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
                    <span className="font-mono text-muted">
                      {selectedEmail.date ? new Date(selectedEmail.date).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attachments Section */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip size={12} />
                    Attachments ({attachments.length})
                  </h4>
                  {attachments.length > 0 && (
                    <div className="flex gap-2">
                      <button onClick={selectAll} className="text-[10px] font-bold text-primary hover:text-blue-400">
                        All
                      </button>
                      <span className="text-[10px] text-muted">|</span>
                      <button onClick={selectPdfOnly} className="text-[10px] font-bold text-red hover:text-red/80">
                        PDF
                      </button>
                      <span className="text-[10px] text-muted">|</span>
                      <button onClick={selectCsvOnly} className="text-[10px] font-bold text-green hover:text-green/80">
                        CSV/Excel
                      </button>
                      <span className="text-[10px] text-muted">|</span>
                      <button onClick={clearAll} className="text-[10px] font-bold text-muted hover:text-text">
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {loadingAttachments ? (
                  <div className="p-8 text-center text-muted flex flex-col items-center gap-2">
                    <Loader className="animate-spin text-primary" size={20} />
                    <span className="text-xs">Loading files...</span>
                  </div>
                ) : attachments.length === 0 ? (
                  <div className="p-8 text-center text-muted flex flex-col items-center gap-2 italic text-xs">
                    <FileText size={24} className="opacity-50" />
                    No attachments found in this email
                  </div>
                ) : (
                  <div className="space-y-2">
                    {attachments.map((att) => {
                      const ext = getFileExt(att.filename);
                      const Icon = FILE_ICONS[ext] || File;
                      const color = FILE_COLORS[ext] || 'text-muted';
                      return (
                        <div
                          key={att.filename}
                          onClick={() => toggleAttachment(att.filename)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            att.isSelected
                              ? 'bg-primary/10 border-primary/30 shadow-[0_0_8px_rgba(59,130,246,0.1)]'
                              : 'bg-white/5 border-glass-border hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={att.isSelected}
                              onChange={() => toggleAttachment(att.filename)}
                              className="accent-primary w-4 h-4"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className={`p-2 rounded-lg bg-white/5 border border-glass-border flex-shrink-0 ${color}`}>
                              <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-text truncate">{att.filename}</div>
                              <div className="text-[10px] text-muted mt-0.5">
                                {formatBytes(att.size)}
                                {att.contentType && <> &middot; {att.contentType}</>}
                              </div>
                            </div>
                            {att.isSelected && (
                              <CheckCircle size={16} className="text-primary flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Process Result */}
                {processResult && (
                  <div className="mt-3 p-3 rounded-xl bg-green/10 border border-green/20 text-xs space-y-1">
                    <div className="font-bold text-green flex items-center gap-1">
                      <CheckCircle size={12} /> Processing Complete
                    </div>
                    {processResult.map((r: any, i: number) => (
                      <div key={i} className="text-green/80">
                        {r.filename}: {r.medicines?.length || 0} items imported
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Process Button */}
              <div className="p-4 border-t border-glass-border flex-shrink-0 space-y-2">
                <div className="text-[11px] text-muted">
                  {selectedCount === 0
                    ? 'Select files above to proceed'
                    : `${selectedCount} file(s) selected`}
                </div>
                <button
                  onClick={handleProcess}
                  disabled={processing || selectedCount === 0}
                  className={`w-full premium-btn text-xs font-bold uppercase tracking-wider py-2.5 flex items-center justify-center gap-2 rounded-xl transition-all ${
                    processing || selectedCount === 0
                      ? 'bg-white/5 border border-glass-border text-muted cursor-not-allowed'
                      : 'bg-green text-text shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:bg-green/90'
                  }`}
                >
                  {processing ? (
                    <>
                      <Loader size={14} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet size={14} />
                      Process & Create Purchase Bill
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="flex flex-col h-full justify-center items-center text-center space-y-4 py-8 px-4">
              <div className="p-4 rounded-full bg-white/5 text-muted border border-glass-border/40 animate-pulse">
                <MailIcon size={32} className="opacity-80" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-text">Select an Email</h4>
                <p className="text-xs text-muted max-w-[220px] leading-relaxed">
                  Click any email from the list to view its attachments, then select files to create a purchase bill.
                </p>
              </div>
              <div className="flex items-center gap-6 text-[10px] text-muted mt-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red" /> PDF
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green" /> CSV
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green" /> Excel
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Mail;
