import { useEffect, useState, useCallback } from 'react';
import { Users, UserPlus, Search, Trash2, Edit2, X, Clock, ChevronRight, CheckCircle } from 'lucide-react';
import { api } from '../services/api';

interface Patient {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
}

const emptyForm = { name: '', phone: '', address: '', notes: '' };

const CRM = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showNotif = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchPatients = useCallback(async () => {
    try {
      const data = await api.getPatients();
      setPatients(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showNotif('Name is required', 'error'); return; }
    setSaving(true);
    try {
      if (editingId !== null) {
        await api.updatePatient(editingId, form);
        showNotif('Patient updated successfully');
      } else {
        await api.addPatient(form);
        showNotif('Patient saved successfully');
      }
      setForm(emptyForm);
      setEditingId(null);
      fetchPatients();
    } catch (err) {
      showNotif('Failed to save patient', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p: Patient) => {
    setEditingId(p.id);
    setForm({ name: p.name, phone: p.phone || '', address: p.address || '', notes: p.notes || '' });
    setSelectedPatient(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this patient?')) return;
    try {
      await api.deletePatient(id);
      showNotif('Patient deleted');
      if (selectedPatient?.id === id) setSelectedPatient(null);
      fetchPatients();
    } catch { showNotif('Failed to delete', 'error'); }
  };

  const handleSelectPatient = async (p: Patient) => {
    setSelectedPatient(p);
    setHistoryLoading(true);
    setHistory([]);
    try {
      const data = await api.getPatientHistory(p.id);
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.phone || '').includes(searchQuery)
  );

  return (
    <div className="h-full flex flex-col fade-in space-y-6">
      {/* Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl text-xs font-semibold
          ${notification.type === 'success' ? 'bg-green/15 border-green/30 text-green-200' : 'bg-red/15 border-red/30 text-red-200'}`}>
          <CheckCircle size={14} />
          {notification.msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">

        {/* LEFT: Form */}
        <div className="md:col-span-1 flex flex-col space-y-4">
          <div className="glass-panel p-6">
            <h3 className="font-bold flex items-center gap-2 mb-5 text-sm">
              <UserPlus size={16} className="text-primary" />
              {editingId !== null ? 'Edit Patient' : 'Register New Patient'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              {(['name', 'phone', 'address', 'notes'] as const).map(field => (
                <div key={field} className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wider">
                    {field.charAt(0).toUpperCase() + field.slice(1)}{field === 'name' ? ' *' : ''}
                  </label>
                  <input
                    type={field === 'phone' ? 'tel' : 'text'}
                    className="premium-input w-full"
                    placeholder={field === 'phone' ? '10-digit number' : field === 'notes' ? 'e.g. Diabetes, BP' : ''}
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    maxLength={field === 'phone' ? 10 : undefined}
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="premium-btn bg-primary text-white shadow-[0_4px_14px_rgba(14,165,233,0.3)] hover:bg-sky-500 flex-1 font-bold"
                >
                  {saving ? 'Saving...' : editingId !== null ? 'Update Patient' : 'Save Patient'}
                </button>
                {editingId !== null && (
                  <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}
                    className="p-2 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 text-muted">
                    <X size={16} />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Patient Detail / History */}
          {selectedPatient && (
            <div className="glass-panel p-5 flex-1 overflow-y-auto scrollbar-thin">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <Clock size={14} className="text-sky" /> Purchase History
                </h4>
                <button onClick={() => setSelectedPatient(null)} className="text-muted hover:text-white">
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs font-bold text-text mb-3">{selectedPatient.name}</p>
              {historyLoading ? (
                <p className="text-xs text-muted">Loading...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted">No purchase history found.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h: any) => (
                    <div key={h.id} className="bg-white/5 border border-glass-border/30 rounded-lg p-3">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-primary">{h.invoice_no}</span>
                        <span className="text-green">₹{h.total_amount?.toFixed(2)}</span>
                      </div>
                      <p className="text-[10px] text-muted mt-1">{new Date(h.date).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Patient Directory */}
        <div className="md:col-span-2 glass-panel flex flex-col overflow-hidden">
          <div className="p-4 border-b border-glass-border bg-white/5 flex items-center gap-3">
            <Users size={16} className="text-sky" />
            <h3 className="font-bold text-sm flex-1">Patient Directory</h3>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 text-muted" size={13} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search name or phone..."
                className="premium-input pl-8 pr-3 py-1.5 text-xs w-full"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
                <tr>
                  {['ID', 'Name', 'Phone', 'Address', 'Notes', 'Actions'].map(h => (
                    <th key={h} className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted">Loading patients...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="p-12 text-center text-muted">
                    {searchQuery ? 'No patients match your search.' : 'No patients registered yet.'}
                  </td></tr>
                ) : filtered.map(p => (
                  <tr key={p.id}
                    className={`hover:bg-white/5 transition-colors border-b border-glass-border/40 cursor-pointer ${selectedPatient?.id === p.id ? 'bg-primary/5' : ''}`}
                    onClick={() => handleSelectPatient(p)}
                  >
                    <td className="p-3 text-muted font-mono">{p.id}</td>
                    <td className="p-3 font-semibold text-text">{p.name}</td>
                    <td className="p-3 font-mono">{p.phone || '-'}</td>
                    <td className="p-3 text-muted max-w-[120px] truncate">{p.address || '-'}</td>
                    <td className="p-3 text-muted max-w-[100px] truncate">{p.notes || '-'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleSelectPatient(p)}
                          className="p-1.5 rounded hover:bg-sky/20 text-sky transition-colors" title="View History">
                          <ChevronRight size={13} />
                        </button>
                        <button onClick={() => handleEdit(p)}
                          className="p-1.5 rounded hover:bg-primary/20 text-primary transition-colors" title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(p.id)}
                          className="p-1.5 rounded hover:bg-red/20 text-red-400 transition-colors" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-glass-border bg-black/10 text-[10px] text-muted px-4">
            Total Patients: <strong>{filtered.length}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CRM;
