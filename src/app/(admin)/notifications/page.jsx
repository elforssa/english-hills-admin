'use client';

import { useEffect, useRef, useState } from 'react';
import { entities, integrations } from '@/lib/entities';
import { Bell, Send, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { learnerNoticeTargets } from '@/lib/portal';
import { createDeliveryTracker } from '@/lib/deliveryOnce.mjs';

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
  const [form, setForm] = useState({ type: 'general', recipient_email: '', recipient_name: '', subject: '', message: '' });
  const [student, setStudent] = useState(null);
  const [targets, setTargets] = useState(null); // D8: linked accounts, else the dossier address (e-mail only)
  const [sending, setSending] = useState(false);
  // Each recipient is e-mailed, then recorded, once: a retry after a part-way failure
  // re-sends nothing that already went out and saves no second row (POR-7).
  const tracker = useRef(createDeliveryTracker());
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleStudentSelect = async (id) => {
    const s = students.find(row => row.id === id) || null;
    setStudent(s); setTargets(null); tracker.current = createDeliveryTracker();
    if (!s) return;
    try {
      setTargets(await learnerNoticeTargets(s));
    } catch {
      toast.error('Impossible de charger les comptes famille de cet apprenant.');
    }
  };

  const recipients = student
    ? (targets?.targets || [])
    : (form.recipient_email ? [{ email: form.recipient_email, name: form.recipient_name }] : []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (recipients.length === 0) { toast.error('Aucun destinataire.'); return; }
    setSending(true);
    try {
      // One e-mail and one row per recipient; the row keeps the learner so the
      // database can attribute it to the linked account (D7b).
      await tracker.current.run(recipients, [
        ['email', recipient => integrations.Core.SendEmail({
          to: recipient.email,
          subject: `[English Hills] ${form.subject}`,
          body: `Bonjour ${recipient.name || ''},\n\n${form.message}\n\n—\nEnglish Hills Language Center`,
        })],
        ['row', recipient => entities.Notification.create({
          ...form, recipient_email: recipient.email, recipient_name: recipient.name || null,
          student_id: student?.id || null, sent: true, sent_at: new Date().toISOString(),
        })],
      ]);
      toast.success('Notification envoyée');
      onSave();
    } catch (err) {
      toast.error("Erreur d'envoi : " + (err.message || 'Veuillez réessayer.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Envoyer une notification</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className={labelClass}>Type</label>
            <select className={inputClass} value={form.type} onChange={e => set('type', e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Apprenant (optionnel)</label>
            <select className={inputClass} value={student?.id || ''} onChange={e => handleStudentSelect(e.target.value)}>
              <option value="">— Ou saisir manuellement —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          {student ? (
            <div className="text-sm">
              <p className={labelClass}>Envoyé à</p>
              {!targets ? <p className="text-muted-foreground">Chargement…</p>
                : targets.targets.length === 0 ? <p className="text-red-700">Aucun compte ni adresse au dossier.</p>
                : <ul className="space-y-1">{targets.targets.map(t => <li key={t.email}>{t.name} · {t.email}</li>)}</ul>}
              {targets?.emailOnly && targets.targets.length > 0 && (
                <p className="mt-1 text-xs text-amber-700">E-mail uniquement, pas de compte : la notification n’apparaîtra dans aucun espace.</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className={labelClass}>Email destinataire *</label>
                <input type="email" className={inputClass} value={form.recipient_email} onChange={e => set('recipient_email', e.target.value)} required />
              </div>
              <div>
                <label className={labelClass}>Nom destinataire</label>
                <input className={inputClass} value={form.recipient_name} onChange={e => set('recipient_name', e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label className={labelClass}>Objet *</label>
            <input className={inputClass} value={form.subject} onChange={e => set('subject', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Message *</label>
            <textarea className={`${inputClass} h-24 resize-none`} value={form.message} onChange={e => set('message', e.target.value)} required />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={sending || (student && !targets)}>
              <Send size={14} /> {sending ? 'Envoi...' : 'Envoyer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = () => Promise.all([
    entities.Notification.listAll('-created_date'),
    entities.Student.listAll('full_name'),
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
        <Button onClick={() => setModal(true)} className="self-start sm:self-auto">
          <Plus size={15} /> Envoyer une notification
        </Button>
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
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[n.type] || TYPE_COLORS.general}`}>{TYPE_LABELS[n.type] || TYPE_LABELS.general}</span>
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
