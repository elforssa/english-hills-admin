'use client';

import { useEffect, useState } from 'react';
import { entities, auth, integrations } from '@/lib/entities';
import { Plus, CheckCircle, XCircle, Trash2, Calendar, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STATUS_COLORS = {
  'En attente': 'bg-yellow-100 text-yellow-700',
  'Approuvé': 'bg-green-100 text-green-700',
  'Refusé': 'bg-red-100 text-red-700',
};

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

function LeaveModal({ leave, teachers, onSave, onClose }) {
  const [form, setForm] = useState(leave || { teacher_id: '', teacher_name: '', date_debut: '', date_fin: '', type_conge: 'Congé annuel', status: 'En attente', remplacant: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleTeacherChange = (tid) => {
    const t = teachers.find(t => t.id === tid);
    setForm(f => ({ ...f, teacher_id: tid, teacher_name: t?.full_name || '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    const payload = { ...form, teacher_id: form.teacher_id || null };
    if (form.id) { await entities.LeaveRequest.update(form.id, payload); toast.success('Mis à jour'); }
    else { await entities.LeaveRequest.create(payload); toast.success('Demande créée'); }
    onSave();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Demande de congé</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Enseignant *</label>
            <select className={inputClass} value={form.teacher_id} onChange={e => handleTeacherChange(e.target.value)} required>
              <option value="">— Choisir —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelClass}>Du *</label><input type="date" className={inputClass} value={form.date_debut} onChange={e => set('date_debut', e.target.value)} required /></div>
            <div><label className={labelClass}>Au *</label><input type="date" className={inputClass} value={form.date_fin} onChange={e => set('date_fin', e.target.value)} required /></div>
          </div>
          <div>
            <label className={labelClass}>Type de congé</label>
            <select className={inputClass} value={form.type_conge} onChange={e => set('type_conge', e.target.value)}>
              {['Congé annuel','Maladie','Personnel','Formation'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className={labelClass}>Remplaçant</label><input className={inputClass} value={form.remplacant || ''} onChange={e => set('remplacant', e.target.value)} /></div>
          <div><label className={labelClass}>Notes</label><textarea className={`${inputClass} h-16 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? '...' : 'Enregistrer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LeaveRequests() {
  const [leaves, setLeaves] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [groups, setGroups] = useState([]);

  const load = () => Promise.all([
    entities.LeaveRequest.list('-created_date', 100),
    entities.Teacher.list('full_name', 100),
  ]).then(([l, t]) => { setLeaves(l); setTeachers(t); setLoading(false); });

  useEffect(() => { load(); }, []);
  useEffect(() => { entities.Group.list('name', 100).then(setGroups); }, []);

  // Notify the teacher of a leave decision — both by email and via an in-app
  // notification row that surfaces in their teacher-portal Notifications tab.
  const notifyTeacherDecision = async (leave, decision) => {
    const teacher = teachers.find(t => t.id === leave.teacher_id);
    const email = teacher?.email;
    if (!email) return;
    const subject = `Demande de congé ${decision.toLowerCase()}`;
    const message =
      `Votre demande de congé (${leave.type_conge}, du ${leave.date_debut} au ${leave.date_fin}) ` +
      `a été ${decision.toLowerCase()}.`;
    try {
      await entities.Notification.create({
        type: 'general',
        recipient_email: email,
        recipient_name: leave.teacher_name || teacher?.full_name || null,
        subject,
        message,
      });
    } catch { /* non-fatal — the status change already succeeded */ }
    try {
      await integrations.Core.SendEmail({ to: email, subject, body: message });
    } catch { /* email is a courtesy nudge */ }
  };

  const handleApprove = async (leave) => {
    await entities.LeaveRequest.update(leave.id, { status: 'Approuvé' });
    toast.success('Approuvé');
    await notifyTeacherDecision(leave, 'Approuvée');
    load();
  };
  const handleRefuse = async (leave) => {
    await entities.LeaveRequest.update(leave.id, { status: 'Refusé' });
    toast.success('Refusé');
    await notifyTeacherDecision(leave, 'Refusée');
    load();
  };
  const handleDelete = async (id) => { if (!confirm('Supprimer ?')) return; await entities.LeaveRequest.delete(id); load(); };

  const diffDays = (d1, d2) => {
    const ms = new Date(d2) - new Date(d1);
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
  };

  const ANNUAL_DAYS = 30;
  const teacherBalances = teachers.map(t => {
    const approved = leaves.filter(l => l.teacher_id === t.id && l.status === 'Approuvé' && l.type_conge === 'Congé annuel');
    const used = approved.reduce((s, l) => s + diffDays(l.date_debut, l.date_fin), 0);
    return { ...t, used, remaining: ANNUAL_DAYS - used };
  });

  const alerts = leaves.filter(l => l.status === 'Approuvé' && !l.remplacant).filter(l => {
    const teacher = teachers.find(t => t.id === l.teacher_id);
    return teacher && groups.some(g => g.teacher_id === teacher.id);
  });

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Congés & absences</h1>
        <Button onClick={() => setModal({})} className="self-start sm:self-auto">
          <Plus size={15} /> Nouvelle demande
        </Button>
      </div>

      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5 flex gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">{alerts.length} enseignant(s) en congé sans remplaçant assigné</p>
            <div className="mt-1 space-y-0.5">
              {alerts.map(l => <p key={l.id} className="text-xs text-amber-700">{l.teacher_name} · {l.date_debut} → {l.date_fin}</p>)}
            </div>
          </div>
        </div>
      )}

      {teacherBalances.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5 mb-5">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><Calendar size={15} /> Soldes de congés annuels ({ANNUAL_DAYS}j / enseignant)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {teacherBalances.map(t => (
              <div key={t.id} className="bg-muted rounded-lg p-3">
                <p className="text-xs font-semibold truncate">{t.full_name}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 bg-white rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (t.used / ANNUAL_DAYS) * 100)}%`, backgroundColor: t.remaining < 5 ? '#B91C2E' : 'var(--brand)' }} />
                  </div>
                  <span className="text-xs font-bold flex-shrink-0" style={{ color: t.remaining < 5 ? '#B91C2E' : 'var(--brand)' }}>{t.remaining}j</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t.used}j utilisés</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {leaves.map(l => (
                <div key={l.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm">{l.teacher_name}</p>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[l.status] || ''}`}>{l.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{l.type_conge} · {l.date_debut} → {l.date_fin} ({diffDays(l.date_debut, l.date_fin)} j)</p>
                  {l.remplacant && <p className="text-xs text-muted-foreground mt-0.5">Remplaçant: {l.remplacant}</p>}
                  <div className="flex gap-2 mt-3">
                    {l.status === 'En attente' && <>
                      <button onClick={() => handleApprove(l)} className="p-1.5 rounded hover:bg-green-50 text-muted-foreground hover:text-green-600"><CheckCircle size={15} /></button>
                      <button onClick={() => handleRefuse(l)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><XCircle size={15} /></button>
                    </>}
                    <button onClick={() => setModal(l)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Plus size={15} className="rotate-45" /></button>
                    <button onClick={() => handleDelete(l.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    {['Enseignant','Type','Du','Au','Durée','Remplaçant','Statut','Actions'].map(h => <th key={h} className="text-left px-4 py-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {leaves.map(l => (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{l.teacher_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.type_conge}</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.date_debut}</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.date_fin}</td>
                      <td className="px-4 py-3 text-muted-foreground">{diffDays(l.date_debut, l.date_fin)} j</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.remplacant || '—'}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[l.status] || ''}`}>{l.status}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {l.status === 'En attente' && <>
                            <button onClick={() => handleApprove(l)} className="p-1 rounded hover:bg-green-50 text-muted-foreground hover:text-green-600"><CheckCircle size={14} /></button>
                            <button onClick={() => handleRefuse(l)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><XCircle size={14} /></button>
                          </>}
                          <button onClick={() => setModal(l)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Plus size={14} className="rotate-45" /></button>
                          <button onClick={() => handleDelete(l.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {modal !== null && <LeaveModal leave={modal.id ? modal : null} teachers={teachers} onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
    </div>
  );
}
