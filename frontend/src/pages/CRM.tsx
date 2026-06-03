import { useEffect, useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { api } from '../services/api';

const CRM = () => {
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPatients()
      .then(data => {
        setPatients(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="h-full flex flex-col fade-in space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        <div className="md:col-span-1 flex flex-col space-y-6">
          <div className="glass-panel p-6">
            <h3 className="font-bold flex items-center gap-2 mb-6">
              <UserPlus size={18} className="text-primary" /> 
              Register New Patient
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Name *</label>
                <input type="text" className="premium-input w-full" placeholder="Full Name" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Phone</label>
                <input type="text" className="premium-input w-full" placeholder="10-digit number" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Address</label>
                <input type="text" className="premium-input w-full" placeholder="Patient Address" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Notes / Disease</label>
                <input type="text" className="premium-input w-full" placeholder="e.g. Diabetes, BP" />
              </div>
              <button className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600 w-full mt-4">
                Save Patient
              </button>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 glass-panel flex flex-col overflow-hidden">
          <div className="p-5 border-b border-glass-border bg-white/5">
            <h3 className="font-bold flex items-center gap-2">
              <Users size={18} className="text-sky" /> 
              Patient Directory
            </h3>
          </div>
          <div className="flex-1 overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">ID</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Name</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Phone</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Notes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="p-8 text-center text-muted">Loading patients...</td></tr>
                ) : patients.length === 0 ? (
                  <tr><td colSpan={4} className="p-12 text-center text-muted">No patients found.</td></tr>
                ) : (
                  patients.map(p => (
                    <tr key={p.id} className="hover:bg-white/5 transition-colors border-b border-glass-border">
                      <td className="p-4 text-sm text-muted">{p.id}</td>
                      <td className="p-4 text-sm font-semibold">{p.name}</td>
                      <td className="p-4 text-sm">{p.phone || '-'}</td>
                      <td className="p-4 text-sm text-muted">{p.notes || '-'}</td>
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

export default CRM;
