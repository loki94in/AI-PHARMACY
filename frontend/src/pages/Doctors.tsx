import { useEffect, useState } from 'react';
import { UserPlus, Stethoscope, Search, Trash2 } from 'lucide-react';
import { api } from '../services/api';

interface DoctorForm {
  name: string;
  specialization: string;
  phone: string;
  hospital: string;
  commission_percent: string;
  registration_no: string;
}

const emptyForm: DoctorForm = {
  name: '',
  specialization: '',
  phone: '',
  hospital: '',
  commission_percent: '',
  registration_no: '',
};

const Doctors = () => {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<DoctorForm>(emptyForm);

  const fetchDoctors = () => {
    setLoading(true);
    api.getDoctors()
      .then(data => {
        setDoctors(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  const handleChange = (field: keyof DoctorForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      name: form.name.trim(),
      commission_percent: form.commission_percent ? Number(form.commission_percent) : 0,
    };
    api.addDoctor(payload)
      .then(() => {
        setForm(emptyForm);
        fetchDoctors();
      })
      .catch(() => {
        // error handled silently
      })
      .finally(() => setSaving(false));
  };

  const filtered = doctors.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.specialization && d.specialization.toLowerCase().includes(q)) ||
      (d.phone && d.phone.toLowerCase().includes(q)) ||
      (d.hospital && d.hospital.toLowerCase().includes(q)) ||
      (d.registration_no && d.registration_no.toLowerCase().includes(q))
    );
  });

  return (
    <div className="h-full flex flex-col fade-in space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        {/* Left Panel – Register New Doctor */}
        <div className="md:col-span-1 flex flex-col space-y-6">
          <div className="glass-panel p-6">
            <h3 className="font-bold flex items-center gap-2 mb-6">
              <UserPlus size={18} className="text-primary" />
              Register New Doctor
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="doc-name" className="text-xs font-bold text-muted uppercase tracking-wider">Name *</label>
                <input
                  id="doc-name"
                  type="text"
                  className="premium-input w-full"
                  placeholder="Dr. Full Name"
                  aria-label="Doctor name"
                  value={form.name}
                  onChange={e => handleChange('name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="doc-spec" className="text-xs font-bold text-muted uppercase tracking-wider">Specialization</label>
                <input
                  id="doc-spec"
                  type="text"
                  className="premium-input w-full"
                  placeholder="e.g. Cardiologist, ENT"
                  aria-label="Specialization"
                  value={form.specialization}
                  onChange={e => handleChange('specialization', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="doc-phone" className="text-xs font-bold text-muted uppercase tracking-wider">Phone</label>
                <input
                  id="doc-phone"
                  type="text"
                  className="premium-input w-full"
                  placeholder="10-digit number"
                  aria-label="Phone"
                  value={form.phone}
                  onChange={e => handleChange('phone', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="doc-hospital" className="text-xs font-bold text-muted uppercase tracking-wider">Hospital / Clinic</label>
                <input
                  id="doc-hospital"
                  type="text"
                  className="premium-input w-full"
                  placeholder="Hospital or Clinic name"
                  aria-label="Hospital or Clinic"
                  value={form.hospital}
                  onChange={e => handleChange('hospital', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="doc-commission" className="text-xs font-bold text-muted uppercase tracking-wider">Commission %</label>
                <input
                  id="doc-commission"
                  type="number"
                  min="0"
                  max="100"
                  className="premium-input w-full"
                  placeholder="e.g. 10"
                  aria-label="Commission percentage"
                  value={form.commission_percent}
                  onChange={e => handleChange('commission_percent', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="doc-reg" className="text-xs font-bold text-muted uppercase tracking-wider">Registration No.</label>
                <input
                  id="doc-reg"
                  type="text"
                  className="premium-input w-full"
                  placeholder="Medical council reg. no."
                  aria-label="Registration number"
                  value={form.registration_no}
                  onChange={e => handleChange('registration_no', e.target.value)}
                />
              </div>
              <button
                className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600 w-full mt-4"
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
              >
                {saving ? 'Saving…' : 'Save Doctor'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel – Doctor Directory */}
        <div className="md:col-span-2 glass-panel flex flex-col overflow-hidden">
          <div className="p-5 border-b border-glass-border bg-white/5 flex items-center justify-between gap-4 flex-wrap">
            <h3 className="font-bold flex items-center gap-2">
              <Stethoscope size={18} className="text-sky" />
              Doctor Directory
            </h3>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                className="premium-input pl-8 w-56"
                placeholder="Search doctors…"
                aria-label="Search doctors"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">ID</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Name</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Specialization</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Phone</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Hospital</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Commission%</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted animate-pulse">Loading doctors…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center text-muted">{search ? 'No matching doctors found.' : 'No doctors registered yet.'}</td></tr>
                ) : (
                  filtered.map(d => (
                    <tr key={d.id} className="hover:bg-white/5 transition-colors border-b border-glass-border">
                      <td className="p-4 text-sm text-muted">{d.id}</td>
                      <td className="p-4 text-sm font-semibold">{d.name}</td>
                      <td className="p-4 text-sm">{d.specialization || '-'}</td>
                      <td className="p-4 text-sm">{d.phone || '-'}</td>
                      <td className="p-4 text-sm">{d.hospital || '-'}</td>
                      <td className="p-4 text-sm">{d.commission_percent != null ? `${d.commission_percent}%` : '-'}</td>
                      <td className="p-4 text-sm">
                        <button
                          className="p-1.5 rounded-lg hover:bg-red/20 text-muted hover:text-red transition-colors"
                          aria-label={`Delete doctor ${d.name}`}
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Doctors;
