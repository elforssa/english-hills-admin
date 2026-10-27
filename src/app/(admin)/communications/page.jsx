'use client';

import { useEffect, useRef, useState } from 'react';
import { entities, auth, integrations } from '@/lib/entities';
import { MessageSquare, Megaphone, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { learnerNoticeTargets } from '@/lib/portal';
import { createDeliveryTracker } from '@/lib/deliveryOnce.mjs';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

function AnnouncementModal({ groups, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', group_id: '', pinned: false });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    const user = await auth.me();
    await entities.Announcement.create({ ...form, group_id: form.group_id || null, author: user?.full_name || 'Admin' });
    toast.success('Annonce publiée'); onSave();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle annonce</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Titre *</label>
            <input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Message *</label>
            <textarea className={`${inputClass} h-24 resize-none`} value={form.body} onChange={e => set('body', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Audience</label>
            <select className={inputClass} value={form.audience} onChange={e => set('audience', e.target.value)}>
              <option value="all">Tous</option>
              <option value="parents">Parents</option>
              <option value="teachers">Enseignants</option>
              <option value="group">Groupe spécifique</option>
            </select>
          </div>
          {form.audience === 'group' && (
            <div>
              <label className={labelClass}>Groupe</label>
              <select className={inputClass} value={form.group_id} onChange={e => set('group_id', e.target.value)}>
                <option value="">— Choisir —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.pinned} onChange={e => set('pinned', e.target.checked)} />
            Épingler cette annonce
          </label>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>
              <Megaphone size={14} /> {saving ? '...' : 'Publier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MessageModal({ students, onSave, onClose }) {
  const [form, setForm] = useState({ to_user_email: '', to_name: '', subject: '', body: '', type: 'message' });
  const [student, setStudent] = useState(null);
  const [targets, setTargets] = useState(null); // { emailOnly, targets } for a chosen learner
  const [sending, setSending] = useState(false);
  // Each recipient's row is saved, then e-mailed, once: a retry after a part-way
  // failure skips what is done — no second row, no second e-mail (POR-7).
  const tracker = useRef(createDeliveryTracker());
  const [saved, setSaved] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleStudentSelect = async (id) => {
    const s = students.find(row => row.id === id) || null;
    setStudent(s); setTargets(null); setSaved(false); tracker.current = createDeliveryTracker();
    if (!s) return;
    try {
      setTargets(await learnerNoticeTargets(s));
    } catch {
      toast.error('Impossible de charger les comptes famille de cet apprenant.');
    }
  };

  const recipients = student ? (targets?.targets || []) : (form.to_user_email ? [{ email: form.to_user_email, name: form.to_name }] : []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (recipients.length === 0) { toast.error('Aucun destinataire.'); return; }
    setSending(true);
    try {
      const user = await auth.me();
      // One row and one e-mail per recipient: no recipient sees another family's address.
      await tracker.current.run(recipients, [
        ['row', async (recipient) => {
          const row = await entities.Message.create({
            ...form,
            to_user_email: recipient.email,
            to_name: recipient.name || form.to_name,
            student_id: student?.id || null,
            from_user_email: user?.email || '',
            from_name: user?.full_name || 'Admin',
          });
          setSaved(true);
          return row;
        }],
        ['email', (recipient, state) => integrations.Core.SendEmail({
          to: state.row.to_user_email,
          subject: `[English Hills] ${form.subject}`,
          body: `Bonjour ${state.row.to_name || ''},\n\n${form.body}\n\n—\nEnglish Hills Language Center`,
          message_id: state.row.id,
        })],
      ]);
      toast.success('Message envoyé'); onSave();
    } catch {
      // entities / integrations already toasted; what succeeded is kept for a retry.
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau message</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className={labelClass}>Type</label>
            <select className={inputClass} value={form.type} onChange={e => set('type', e.target.value)} disabled={Boolean(saved)}>
              <option value="message">Message</option>
              <option value="document_request">Demande de document</option>
              <option value="announcement">Annonce</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Destinataire (apprenant)</label>
            <select className={inputClass} value={student?.id || ''} onChange={e => handleStudentSelect(e.target.value)} disabled={Boolean(saved)}>
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
                <p className="mt-1 text-xs text-amber-700">E-mail uniquement, pas de compte : le message n’apparaîtra dans aucun espace.</p>
              )}
            </div>
          ) : (
            <div>
              <label className={labelClass}>Email destinataire *</label>
              <input type="email" className={inputClass} value={form.to_user_email} onChange={e => set('to_user_email', e.target.value)} required disabled={Boolean(saved)} />
            </div>
          )}
          <div>
            <label className={labelClass}>Objet *</label>
            <input className={inputClass} value={form.subject} onChange={e => set('subject', e.target.value)} required disabled={Boolean(saved)} />
          </div>
          <div>
            <label className={labelClass}>Message *</label>
            <textarea className={`${inputClass} h-24 resize-none`} value={form.body} onChange={e => set('body', e.target.value)} required disabled={Boolean(saved)} />
          </div>
          {/* Only after a part-way failure: during a normal send `saved` is already true. */}
          {saved && !sending && <p className="text-xs text-amber-700">Envoi interrompu. « Envoyer » reprend là où il s’est arrêté, sans doublon.</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={saved ? onSave : onClose}>{saved ? 'Fermer' : 'Annuler'}</Button>
            <Button type="submit" disabled={sending || (student && !targets)}>
              <Send size={14} /> {sending ? '...' : 'Envoyer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Communications() {
  const [messages, setMessages] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('announcements');
  const [announcementModal, setAnnouncementModal] = useState(false);
  const [messageModal, setMessageModal] = useState(false);

  const load = () => Promise.all([
    entities.Message.listAll('-created_date'),
    entities.Announcement.listAll('-created_date'),
    entities.Student.listAll('full_name'),
    entities.Group.listAll('name'),
  ]).then(([m, a, s, g]) => { setMessages(m); setAnnouncements(a); setStudents(s); setGroups(g); setLoading(false); });

  useEffect(() => { load(); }, []);

  const deleteAnnouncement = async (id) => { await entities.Announcement.delete(id); toast.success('Supprimé'); load(); };
  const deleteMessage = async (id) => { await entities.Message.delete(id); toast.success('Supprimé'); load(); };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Communications</h1>
        <div className="flex gap-2">
          <button onClick={() => setMessageModal(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted">
            <MessageSquare size={14} /> Message
          </button>
          <button onClick={() => setAnnouncementModal(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90 bg-primary">
            <Megaphone size={14} /> Annonce
          </button>
        </div>
      </div>

      <div className="flex gap-1 border border-border rounded-lg p-1 bg-muted w-fit mb-6">
        {[{ id: 'announcements', label: 'Annonces' }, { id: 'messages', label: 'Messages' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>
      ) : tab === 'announcements' ? (
        <div className="space-y-3">
          {announcements.map(a => (
            <div key={a.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {a.pinned && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Épinglé</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{a.audience === 'all' ? 'Tous' : a.audience}</span>
                  </div>
                  <p className="font-semibold text-sm">{a.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{a.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">Par {a.author} · {a.created_date?.split('T')[0]}</p>
                </div>
                <button onClick={() => deleteAnnouncement(a.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 flex-shrink-0"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {announcements.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucune annonce.</div>}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
          {messages.map(m => (
            <div key={m.id} className="flex items-start gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.type === 'document_request' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                    {m.type === 'document_request' ? 'Demande de doc' : 'Message'}
                  </span>
                  <span className="text-xs text-muted-foreground">→ {m.to_user_email}</span>
                </div>
                <p className="text-sm font-medium">{m.subject}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.body}</p>
                <p className="text-xs text-muted-foreground mt-1">De {m.from_name} · {m.created_date?.split('T')[0]}</p>
              </div>
              <button onClick={() => deleteMessage(m.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 flex-shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
          {messages.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucun message.</div>}
        </div>
      )}
      {announcementModal && <AnnouncementModal groups={groups} onSave={() => { setAnnouncementModal(false); load(); }} onClose={() => setAnnouncementModal(false)} />}
      {messageModal && <MessageModal students={students} onSave={() => { setMessageModal(false); load(); }} onClose={() => setMessageModal(false)} />}
    </div>
  );
}
