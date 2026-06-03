import { useState } from 'react';
import { Truck, Package, Clock, CheckCircle, MapPin, Plus, X, User } from 'lucide-react';

interface DispatchItem {
  id: string;
  patient: string;
  address: string;
  items: string;
  status: 'Pending' | 'In Transit' | 'Delivered';
  assignedTo: string;
}

const statusStyles: Record<string, string> = {
  Pending: 'bg-amber/20 text-amber border border-amber/30',
  'In Transit': 'bg-sky/20 text-sky border border-sky/30',
  Delivered: 'bg-green/20 text-green border border-green/30',
};

const Dispatch = () => {
  const [dispatches] = useState<DispatchItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    patient: '',
    address: '',
    items: '',
    assignedTo: '',
    notes: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder — no API call
    setShowModal(false);
    setForm({ patient: '', address: '', items: '', assignedTo: '', notes: '' });
  };

  return (
    <div className="h-full flex flex-col fade-in space-y-6 overflow-y-auto pb-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight mb-1">Dispatch &amp; Delivery</h2>
          <p className="text-muted text-sm">Track and manage medicine deliveries.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600"
        >
          <Plus size={16} /> New Dispatch
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pending */}
        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber/10 flex items-center justify-center">
            <Clock size={24} className="text-amber" />
          </div>
          <div>
            <p className="text-xs text-muted font-bold uppercase tracking-wider mb-1">Pending Deliveries</p>
            <p className="text-2xl font-extrabold text-amber">0</p>
          </div>
        </div>

        {/* In Transit */}
        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky/10 flex items-center justify-center">
            <Truck size={24} className="text-sky" />
          </div>
          <div>
            <p className="text-xs text-muted font-bold uppercase tracking-wider mb-1">In Transit</p>
            <p className="text-2xl font-extrabold text-sky">0</p>
          </div>
        </div>

        {/* Delivered Today */}
        <div className="glass-panel p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green/10 flex items-center justify-center">
            <CheckCircle size={24} className="text-green" />
          </div>
          <div>
            <p className="text-xs text-muted font-bold uppercase tracking-wider mb-1">Delivered Today</p>
            <p className="text-2xl font-extrabold text-green">0</p>
          </div>
        </div>
      </div>

      {/* Dispatch Queue Table */}
      <div className="glass-panel flex-1 flex flex-col overflow-hidden">
        <div className="p-5 border-b border-glass-border flex justify-between items-center bg-white/5">
          <h3 className="font-bold flex items-center gap-2">
            <Package size={18} className="text-primary" />
            Dispatch Queue
          </h3>
        </div>

        <div className="flex-1 overflow-auto bg-black/20">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
              <tr>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Order ID</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Patient</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Address</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Items</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Status</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Assigned To</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted">
                    <Truck size={48} className="mx-auto text-muted/30 mb-4" />
                    No dispatches pending. All deliveries completed! 🎉
                  </td>
                </tr>
              ) : (
                dispatches.map((d) => (
                  <tr key={d.id} className="hover:bg-white/5 transition-colors border-b border-glass-border">
                    <td className="p-4 text-sm font-semibold text-sky">{d.id}</td>
                    <td className="p-4 text-sm">{d.patient}</td>
                    <td className="p-4 text-sm text-muted flex items-center gap-1">
                      <MapPin size={14} className="text-muted/60 shrink-0" />
                      {d.address}
                    </td>
                    <td className="p-4 text-sm">{d.items}</td>
                    <td className="p-4 text-sm">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusStyles[d.status]}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm flex items-center gap-1.5">
                      <User size={14} className="text-muted/60" />
                      {d.assignedTo}
                    </td>
                    <td className="p-4 text-sm">
                      <button className="text-primary hover:text-white transition-colors text-xs font-semibold">
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Dispatch Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
            aria-hidden="true"
          />

          {/* Modal Content */}
          <div className="relative glass-panel p-6 w-full max-w-lg mx-4 border-green/30 animate-fade-in-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold flex items-center gap-2 text-lg">
                <Truck size={20} className="text-green" />
                New Dispatch
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="dispatch-patient" className="text-xs font-bold text-muted uppercase tracking-wider">
                  Patient Name *
                </label>
                <input
                  id="dispatch-patient"
                  name="patient"
                  type="text"
                  className="premium-input w-full"
                  placeholder="e.g. Rahul Sharma"
                  value={form.patient}
                  onChange={handleChange}
                  required
                  aria-label="Patient Name"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="dispatch-address" className="text-xs font-bold text-muted uppercase tracking-wider">
                  Address *
                </label>
                <input
                  id="dispatch-address"
                  name="address"
                  type="text"
                  className="premium-input w-full"
                  placeholder="e.g. 12, MG Road, Bangalore"
                  value={form.address}
                  onChange={handleChange}
                  required
                  aria-label="Address"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="dispatch-items" className="text-xs font-bold text-muted uppercase tracking-wider">
                  Items List *
                </label>
                <input
                  id="dispatch-items"
                  name="items"
                  type="text"
                  className="premium-input w-full"
                  placeholder="e.g. Paracetamol 500mg x2, Cough Syrup x1"
                  value={form.items}
                  onChange={handleChange}
                  required
                  aria-label="Items List"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="dispatch-assigned" className="text-xs font-bold text-muted uppercase tracking-wider">
                  Assign Delivery Boy
                </label>
                <input
                  id="dispatch-assigned"
                  name="assignedTo"
                  type="text"
                  className="premium-input w-full"
                  placeholder="e.g. Ravi Kumar"
                  value={form.assignedTo}
                  onChange={handleChange}
                  aria-label="Assign Delivery Boy"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="dispatch-notes" className="text-xs font-bold text-muted uppercase tracking-wider">
                  Notes
                </label>
                <textarea
                  id="dispatch-notes"
                  name="notes"
                  className="premium-input w-full min-h-[80px] resize-none"
                  placeholder="Any special delivery instructions..."
                  value={form.notes}
                  onChange={handleChange}
                  aria-label="Notes"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="premium-btn bg-green text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:bg-emerald-600 flex-1"
                >
                  <Plus size={16} /> Create Dispatch
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="premium-btn bg-white/5 border border-glass-border text-muted hover:text-white hover:bg-white/10 flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dispatch;
