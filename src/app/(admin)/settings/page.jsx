'use client';

import { useEffect, useState } from 'react';
import { entities, auth, users } from '@/lib/entities';
import { Building2, Users, UserPlus, Edit2, Check, X, Save, CalendarDays, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const inputReadOnly = "w-full border border-border rounded-md px-3 py-2 text-sm bg-muted text-muted-foreground focus:outline-none";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

const CENTER_INFO_DEFAULT = {
  name: 'English Hills Language Center',
  tagline: 'Learn Today, Lead Tomorrow',
  email: 'contact@english-hills.com',
  phone1: '+212 5XX-XXXXXX',
  phone2: '+212 6XX-XXXXXX',
  address: 'Almaz 2, Hills Business Center, Bâtiment B, Bureau 6, Casablanca',
  website: 'https://english-hills.com',
  facebook: 'https://facebook.com/englishhills',
  instagram: 'https://instagram.com/englishhills',
  programs: [
    'Young Learners (6–12 ans) — A1 à B1',
    'Teens (13–17 ans) — A1 à C1',
    'Adults (18+) — Tous niveaux',
    'Corporate English — Business communication',
    'Préparation aux examens — IELTS, TOEFL, Cambridge',
  ],
};

const CENTER_INFO_KEY = 'eh_center_info';

const ROLE_CONFIG = [
  { value: 'director', label: 'Directeur', color: '#B91C2E' },
  { value: 'admin', label: 'Admin', color: 'var(--brand)' },
  { value: 'teacher', label: 'Enseignant', color: '#7c3aed' },
  { value: 'parent', label: 'Parent', color: '#0891b2' },
  { value: 'student', label: 'Apprenant', color: '#059669' },
];

function getRoleLabel(role) {
  return ROLE_CONFIG.find(r => r.value === role)?.label || role;
}
function getRoleColor(role) {
  return ROLE_CONFIG.find(r => r.value === role)?.color || '#888';
}

function UserManagement({ currentUser }) {
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState('');

  const isDirector = currentUser?.role === 'director';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'director';

  const load = async () => {
    setLoading(true);
    const list = await entities.User.list('full_name', 200);
    setUsersList(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (user) => {
    setEditingId(user.id);
    setEditRole(user.role || 'parent');
  };

  const cancelEdit = () => { setEditingId(null); setEditRole(''); };

  const saveRole = async (userId) => {
    if (!isDirector && (editRole === 'director' || editRole === 'admin')) {
      toast.error('Seul le directeur peut attribuer ce rôle.');
      return;
    }
    try {
      await users.updateRole(userId, editRole);
      toast.success('Rôle mis à jour');
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(err?.message || 'Échec de la mise à jour du rôle.');
    }
  };

  const availableRoles = isDirector
    ? ROLE_CONFIG
    : ROLE_CONFIG.filter(r => !['director', 'admin'].includes(r.value));

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <Users size={18} style={{ color: 'var(--brand)' }} />
        <h2 className="font-semibold">Gestion des utilisateurs</h2>
      </div>
      {!isAdmin && (
        <p className="text-sm text-muted-foreground">Accès réservé aux administrateurs.</p>
      )}
      {isAdmin && (
        loading ? (
          <p className="text-sm text-muted-foreground py-4">Chargement...</p>
        ) : (
          <div className="space-y-2">
            {usersList.map(u => (
              <div key={u.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                {editingId === u.id ? (
                  <div className="flex items-center gap-2">
                    <select
                      className="border border-border rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                      value={editRole}
                      onChange={e => setEditRole(e.target.value)}
                    >
                      {availableRoles.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <button onClick={() => saveRole(u.id)} className="p-1 rounded hover:bg-green-50 text-green-600"><Check size={14} /></button>
                    <button onClick={cancelEdit} className="p-1 rounded hover:bg-red-50 text-muted-foreground"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{ backgroundColor: getRoleColor(u.role) + '18', color: getRoleColor(u.role) }}
                    >
                      {getRoleLabel(u.role || 'parent')}
                    </span>
                    {(isDirector || (isAdmin && u.role !== 'director' && u.role !== 'admin')) && (
                      <button onClick={() => startEdit(u)} className="p-1 rounded hover:bg-muted text-muted-foreground"><Edit2 size={13} /></button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function InviteUserForm({ currentUser }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);
  const [invited, setInvited] = useState([]);

  const isDirector = currentUser?.role === 'director';
  const isAdmin = currentUser?.role === 'admin' || isDirector;

  const ROLES = isDirector
    ? [
        { value: 'student', label: 'Apprenant' },
        { value: 'parent',  label: 'Parent' },
        { value: 'teacher', label: 'Enseignant' },
        { value: 'admin',   label: 'Admin' },
        { value: 'director', label: 'Directeur' },
      ]
    : [
        { value: 'student', label: 'Apprenant' },
        { value: 'parent',  label: 'Parent' },
        { value: 'teacher', label: 'Enseignant' },
      ];

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email) return;
    if (!ROLES.some(r => r.value === role)) {
      toast.error("Vous n'êtes pas autorisé à attribuer ce rôle.");
      return;
    }
    setLoading(true);
    const trimmedEmail = email.trim();

    try {
      // The /api/admin/invite route handles caller-role enforcement, the
      // pending_roles upsert, and sends the Supabase invite email
      // (server-side, via the service-role key).
      const result = await users.inviteUser(trimmedEmail, role);
      setInvited(prev => [...prev, { email: trimmedEmail, role }]);
      if (result?.alreadyRegistered) {
        toast.success(`${trimmedEmail} est déjà inscrit — son rôle a été mis à jour vers "${ROLES.find(r => r.value === role)?.label}".`);
      } else {
        toast.success(`Invitation envoyée à ${trimmedEmail} avec le rôle "${ROLES.find(r => r.value === role)?.label}".`);
      }
      setEmail('');
      setRole('student');
    } catch (err) {
      toast.error(err?.message || "Échec de l'envoi de l'invitation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-5">
        <UserPlus size={18} className="text-primary" />
        <h2 className="font-semibold">Inviter un utilisateur</h2>
      </div>

      <form onSubmit={handleInvite} className="space-y-4">
        <div>
          <label className={labelClass}>Adresse email</label>
          <input
            type="email"
            required
            className={inputClass}
            placeholder="partenaire@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Rôle à attribuer</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
            {ROLES.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left ${
                  role === r.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-white text-muted-foreground hover:bg-muted'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex gap-2">
          <CheckCircle size={14} className="shrink-0 mt-0.5 text-green-700" />
          <div>
            <strong>Automatique&nbsp;:</strong> Le rôle <strong>{ROLES.find(r => r.value === role)?.label}</strong> sera appliqué automatiquement dès que l&apos;invité se connecte pour la première fois.
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary hover:opacity-90 disabled:opacity-50 transition"
        >
          <UserPlus size={15} />
          {loading ? 'Envoi...' : "Envoyer l'invitation"}
        </button>
      </form>

      {invited.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Invitations envoyées cette session</p>
          <div className="space-y-1.5">
            {invited.map((inv, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{inv.email}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {ROLES.find(r => r.value === inv.role)?.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TERMES = ['Sept–Déc', 'Jan–Mar', 'Avr–Juin', 'Été'];
const ANNEES = ['2023–2024', '2024–2025', '2025–2026', '2026–2027'];

function CurrentTermSettings() {
  const [termConfig, setTermConfig] = useState(null);
  const [anneeConfig, setAnneeConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [terme, setTerme] = useState('Sept–Déc');
  const [annee, setAnnee] = useState('2024–2025');

  useEffect(() => {
    entities.AppConfig.filter({ key: 'current_term' }).then(res => {
      if (res[0]) { setTermConfig(res[0]); setTerme(res[0].value); }
    });
    entities.AppConfig.filter({ key: 'current_year' }).then(res => {
      if (res[0]) { setAnneeConfig(res[0]); setAnnee(res[0].value); }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (termConfig) {
        await entities.AppConfig.update(termConfig.id, { value: terme });
      } else {
        const created = await entities.AppConfig.create({ key: 'current_term', value: terme, label: 'Terme actuel' });
        setTermConfig(created);
      }
      if (anneeConfig) {
        await entities.AppConfig.update(anneeConfig.id, { value: annee });
      } else {
        const created = await entities.AppConfig.create({ key: 'current_year', value: annee, label: 'Année scolaire' });
        setAnneeConfig(created);
      }
      toast.success('Terme et année mis à jour');
    } catch {
      // entities.js already toasted — caller stays on the page.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 max-w-md">
      <div className="flex items-center gap-3 mb-5">
        <CalendarDays size={18} style={{ color: 'var(--brand)' }} />
        <h2 className="font-semibold">Terme & année scolaire actuel(le)</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Ce réglage est utilisé comme valeur par défaut dans les formulaires de notes, portfolios et bulletins.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Terme actuel</label>
          <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary" value={terme} onChange={e => setTerme(e.target.value)}>
            {TERMES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Année scolaire</label>
          <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary" value={annee} onChange={e => setAnnee(e.target.value)}>
            {ANNEES.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary hover:opacity-90 disabled:opacity-50 transition"
        >
          <Save size={15} />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('center');
  const [currentUser, setCurrentUser] = useState(null);
  const [centerInfo, setCenterInfo] = useState(() => {
    try {
      if (typeof window === 'undefined') return CENTER_INFO_DEFAULT;
      const saved = localStorage.getItem(CENTER_INFO_KEY);
      return saved ? JSON.parse(saved) : CENTER_INFO_DEFAULT;
    } catch {
      return CENTER_INFO_DEFAULT;
    }
  });
  const [editingCenter, setEditingCenter] = useState(false);
  const [centerDraft, setCenterDraft] = useState(null);

  useEffect(() => {
    auth.me()
      .then((u) => {
        setCurrentUser(u);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[settings] auth.me() failed:', err);
      });
  }, []);

  const startEditCenter = () => {
    setCenterDraft({ ...centerInfo });
    setEditingCenter(true);
  };

  const cancelEditCenter = () => {
    setCenterDraft(null);
    setEditingCenter(false);
  };

  const saveCenter = () => {
    setCenterInfo(centerDraft);
    if (typeof window !== 'undefined') {
      localStorage.setItem(CENTER_INFO_KEY, JSON.stringify(centerDraft));
    }
    setEditingCenter(false);
    setCenterDraft(null);
    toast.success('Informations du centre mises à jour');
  };

  const isDirectorRole    = currentUser?.role === 'director';
  const isAdminOrDirector = isDirectorRole || currentUser?.role === 'admin';

  const tabs = [
    { id: 'center', label: 'Informations' },
    { id: 'term', label: 'Terme actuel' },
    ...(isAdminOrDirector ? [
      { id: 'users', label: 'Utilisateurs' },
      { id: 'invite', label: 'Inviter' },
    ] : []),
    { id: 'roles', label: 'Rôles & accès' },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Paramètres du centre</h1>

      <div className="flex gap-1 border border-border rounded-lg p-1 bg-muted w-fit mb-6 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'center' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Building2 size={18} style={{ color: 'var(--brand)' }} />
                <h2 className="font-semibold">Informations du centre</h2>
              </div>
              {isDirectorRole && !editingCenter && (
                <button
                  onClick={startEditCenter}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition"
                >
                  <Edit2 size={13} /> Modifier
                </button>
              )}
              {isDirectorRole && editingCenter && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveCenter}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition bg-primary"
                  >
                    <Save size={13} /> Enregistrer
                  </button>
                  <button onClick={cancelEditCenter} className="p-1.5 rounded-lg border border-border hover:bg-muted transition">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            {(() => {
              const data = editingCenter ? centerDraft : centerInfo;
              const set = (field) => (e) => setCenterDraft(d => ({ ...d, [field]: e.target.value }));
              const cls = editingCenter ? inputClass : inputReadOnly;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Nom du centre</label>
                    <input className={cls} value={data.name} onChange={set('name')} readOnly={!editingCenter} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Tagline</label>
                    <input className={cls} value={data.tagline} onChange={set('tagline')} readOnly={!editingCenter} />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input className={cls} value={data.email} onChange={set('email')} readOnly={!editingCenter} />
                  </div>
                  <div>
                    <label className={labelClass}>Site web</label>
                    <input className={cls} value={data.website} onChange={set('website')} readOnly={!editingCenter} />
                  </div>
                  <div>
                    <label className={labelClass}>Téléphone 1</label>
                    <input className={cls} value={data.phone1} onChange={set('phone1')} readOnly={!editingCenter} />
                  </div>
                  <div>
                    <label className={labelClass}>Téléphone 2</label>
                    <input className={cls} value={data.phone2} onChange={set('phone2')} readOnly={!editingCenter} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Adresse</label>
                    <input className={cls} value={data.address} onChange={set('address')} readOnly={!editingCenter} />
                  </div>
                  <div>
                    <label className={labelClass}>Facebook</label>
                    <input className={cls} value={data.facebook} onChange={set('facebook')} readOnly={!editingCenter} />
                  </div>
                  <div>
                    <label className={labelClass}>Instagram</label>
                    <input className={cls} value={data.instagram} onChange={set('instagram')} readOnly={!editingCenter} />
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold mb-4">Programmes & services</h2>
            <ul className="space-y-2">
              {centerInfo.programs.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'term' && <CurrentTermSettings />}

      {tab === 'users' && <UserManagement currentUser={currentUser} />}
      {tab === 'invite' && <InviteUserForm currentUser={currentUser} />}

      {tab === 'roles' && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <Users size={18} style={{ color: 'var(--brand)' }} />
            <h2 className="font-semibold">Rôles et permissions</h2>
          </div>
          <div className="space-y-3">
            {[
              { role: 'director', label: 'Directeur', desc: 'Accès complet + attribution de tous les rôles', color: '#B91C2E' },
              { role: 'admin', label: 'Admin', desc: 'Gestion complète de la plateforme, présences, sortie des jeunes, inscriptions', color: 'var(--brand)' },
              { role: 'teacher', label: 'Enseignant', desc: 'Ses groupes, présences, notes, portfolios apprenants', color: '#7c3aed' },
              { role: 'parent', label: 'Parent', desc: "Données de son enfant uniquement (présences, notes, paiements, portfolio)", color: '#0891b2' },
              { role: 'student', label: 'Apprenant', desc: 'Sa progression, portfolio, présences', color: '#059669' },
            ].map(r => (
              <div key={r.role} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: r.color }} />
                <div>
                  <p className="text-sm font-semibold">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">Utilisez l&apos;onglet &quot;Utilisateurs&quot; pour modifier le rôle d&apos;un utilisateur existant.</p>
        </div>
      )}
    </div>
  );
}
