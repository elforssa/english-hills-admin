'use client';

import { useEffect, useState } from 'react';
import { entities, integrations } from '@/lib/entities';
import { Bell, Send, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useScrollLock } from '@/hooks/useScrollLock';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

const TYPE_LABELS = {
  absence: 'Absence', payment_reminder: 'Rappel paiement', report_card: 'Bulletin',
  enrollment_confirmed: 'Inscription confirmée', schedule_change: 'Changement horaire',
  class_reminder: 'Rappel de cours', general: 'Général',
};
const TYPE_COLORS = {
  absence: 'bg-red-50 text-red-700', payment_reminder: 'bg-amber-50 text-amber-700',
  report_card: 'bg-blue-50 text-blue-700', enrollment_confirmed: 'bg-green-50 text-green-700',
  schedule_change: 'bg-orange-50 text-orange-700', class_reminder: 'bg-purple-50 text-purple-700',
  general: 'bg-gray-50 text-gray-700',
};

function SendNotifModal({ students, onSave, onClose }) {
  useScrollLock();
  const [form, setForm] = useState({ type: 'general', recipient_email: '', recipient_name: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleStudentSelect = (id) => {
    const s = students.find(s => s.id === id);
    if (s) { set('recipient_email', s.email || ''); set('recipient_name', s.full_name); set('student_id', id); }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await integrations.Core.SendEmail({
        to: form.recipient_email,
        subject: `[English Hills] ${form.subject}`,
        body: `Bonjour ${form.recipient_name},\n\n${form.message}\n\n—\nEnglish Hills Language Center\ncontact@english-hills.com`,
      });
      await entities.Notification.create({ ...form, sent: true, sent_at: new Date().toISOString() });
      toast.success('Notification envoyée');
      onSave();
    } catch (err) {
      setSending(false);
      toast.error("Erreur d'envoi : " + (err.message || 'Veuillez réessayer.'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Envoyer une notification</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-muted-foreground text-xl">×</button>
        </div>
        <form onSubmit={handleSend} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Type</label>
            <select className={inputClass} value={form.type} onChange={e => set('type', e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Apprenant (optionnel)</label>
            <select className={inputClass} onChange={e => handleStudentSelect(e.target.value)}>
              <option value="">— Ou saisir manuellement —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Email destinataire *</label>
            <input type="email" className={inputClass} value={form.recipient_email} onChange={e => set('recipient_email', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Nom destinataire</label>
            <input className={inputClass} value={form.recipient_name} onChange={e => set('recipient_name', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Objet *</label>
            <input className={inputClass} value={form.subject} onChange={e => set('subject', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Message *</label>
            <textarea className={`${inputClass} h-24 resize-none`} value={form.message} onChange={e => set('message', e.target.value)} required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={sending} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50 bg-primary">
              <Send size={14} /> {sending ? 'Envoi...' : 'Envoyer'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = () => Promise.all([
    entities.Notification.list('-created_date', 100),
    entities.Student.list('full_name', 200),
  ]).then(([n, s]) => { setNotifications(n); setStudents(s); setLoading(false); });

  useEffect(() => { load(); }, []);

  const sent = notifications.filter(n => n.sent).length;
  const failed = notifications.filter(n => !n.sent).length;

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Centre de notifications</h1>
          <p className="text-muted-foreground text-sm mt-1">{sent} envoyées · {failed} en erreur</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 self-start sm:self-auto bg-primary">
          <Plus size={15} /> Envoyer une notification
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Absence', type: 'absence' }, { label: 'Rappel paiement', type: 'payment_reminder' },
          { label: 'Rappel cours', type: 'class_reminder' }, { label: 'Général', type: 'general' },
        ].map(({ label, type }) => (
          <button key={type} onClick={() => setModal(true)} className="bg-card border border-border rounded-lg p-4 text-left hover:shadow-md transition-shadow">
            <Bell size={16} className="mb-2 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{notifications.filter(n => n.type === type).length} envoyées</p>
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">Historique des notifications</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map(n => (
              <div key={n.id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5">
                  {n.sent ? <CheckCircle size={15} className="text-green-500" /> : <AlertCircle size={15} className="text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[n.type] || TYPE_COLORS.general}`}>{TYPE_LABELS[n.type]}</span>
                    <span className="text-xs text-muted-foreground truncate">{n.recipient_email}</span>
                  </div>
                  <p className="text-sm font-medium truncate">{n.subject}</p>
                  {n.error && <p className="text-xs text-red-500 mt-0.5">{n.error}</p>}
                </div>
                <p className="text-xs text-muted-foreground flex-shrink-0">{n.created_date?.split('T')[0]}</p>
              </div>
            ))}
            {notifications.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucune notification envoyée.</div>}
          </div>
        )}
      </div>
      {modal && <SendNotifModal students={students} onSave={() => { setModal(false); load(); }} onClose={() => setModal(false)} />}
    </div>
  );
}
