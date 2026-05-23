'use client';

import { useEffect, useState } from 'react';
import { entities, auth, integrations } from '@/lib/entities';
import { MessageSquare, Megaphone, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Nouvelle annonce</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90" style={{ backgroundColor: '#1E4D8B' }}>
              <Megaphone size={14} /> {saving ? '...' : 'Publier'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MessageModal({ students, onSave, onClose }) {
  const [form, setForm] = useState({ to_user_email: '', to_name: '', subject: '', body: '', type: 'message' });
  const [sending, setSending] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleStudentSelect = (id) => {
    const s = students.find(s => s.id === id);
    if (s) { set('to_user_email', s.email || ''); set('to_name', s.full_name); }
  };

  const handleSend = async (e) => {
    e.preventDefault(); setSending(true);
    const user = await auth.me();
    await entities.Message.create({
      ...form,
      from_user_email: user?.email || '',
      from_name: user?.full_name || 'Admin',
    });
    if (form.to_user_email) {
      await integrations.Core.SendEmail({
        to: form.to_user_email,
        subject: `[English Hills] ${form.subject}`,
        body: `Bonjour ${form.to_name},\n\n${form.body}\n\n—\nEnglish Hills Language Center`,
      });
    }
    toast.success('Message envoyé'); onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Nouveau message</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl">×</button>
        </div>
        <form onSubmit={handleSend} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Type</label>
            <select className={inputClass} value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="message">Message</option>
              <option value="document_request">Demande de document</option>
              <option value="announcement">Annonce</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Destinataire (apprenant)</label>
            <select className={inputClass} onChange={e => handleStudentSelect(e.target.value)}>
              <option value="">— Ou saisir manuellement —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Email destinataire *</label>
            <input type="email" className={inputClass} value={form.to_user_email} onChange={e => set('to_user_email', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Objet *</label>
            <input className={inputClass} value={form.subject} onChange={e => set('subject', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Message *</label>
            <textarea className={`${inputClass} h-24 resize-none`} value={form.body} onChange={e => set('body', e.target.value)} required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={sending} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90" style={{ backgroundColor: '#1E4D8B' }}>
              <Send size={14} /> {sending ? '...' : 'Envoyer'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
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
    entities.Message.list('-created_date', 100),
    entities.Announcement.list('-created_date', 50),
    entities.Student.list('full_name', 200),
    entities.Group.list('name', 100),
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
          <button onClick={() => setAnnouncementModal(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90" style={{ backgroundColor: '#1E4D8B' }}>
            <Megaphone size={14} /> Annonce
          </button>
        </div>
      </div>

      <div className="flex gap-1 border border-border rounded-lg p-1 bg-muted w-fit mb-6">
        {[{ id: 'announcements', label: 'Annonces' }, { id: 'messages', label: 'Messages' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
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
