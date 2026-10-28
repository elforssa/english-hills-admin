'use client';

// =============================================================================
// MessagesTab — shared inbox/sent panel for the teacher, parent and student
// portals (plan PRF-r2 D7/D7b).
//
// Portal accounts never read or write public.messages directly:
//   • Inbox / Envoyés: portal_my_messages — rows addressed to (or sent by) this
//     account, and about a learner only while the account may see it.
//   • Compose: portal_send_message with an opaque recipient key from
//     portal_message_recipients ("Accueil English Hills", a teacher, "Parent
//     de …"). No address is shown or sent from the browser; the server sets the
//     sender name.
//   • Reply  : replies go to the original sender's account.
//   • Read   : opening an inbox message flips `read=true` (mark_message_read).
// =============================================================================

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Inbox, Send, Mail, ChevronLeft, Reply, X } from 'lucide-react';
import { integrations } from '@/lib/entities';
import { markMessageRead } from '@/lib/messages';
import { getMessageRecipients, getMyMessages, portalErrorMessage, sendPortalMessage } from '@/lib/portal';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-MA', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function MessageList({ items, onOpen, emptyLabel, showUnread = true }) {
  if (items.length === 0) {
    return (
      <div className="p-10 text-center text-muted-foreground text-sm">
        {emptyLabel}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {items.map(m => (
        <li key={m.id}>
          <button
            onClick={() => onOpen(m)}
            className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
          >
            <div
              className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                showUnread && !m.read ? 'bg-primary' : 'bg-transparent'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className={`text-sm truncate ${showUnread && !m.read ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                  {m.counterpart}
                </p>
                <p className="text-xs text-muted-foreground flex-shrink-0">{fmtDate(m.created_at)}</p>
              </div>
              <p className="text-sm truncate text-foreground mt-0.5">{m.subject}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{m.body}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ComposeForm({ recipients, learners, replyTo, onClose, onSent }) {
  const [to, setTo] = useState(recipients?.[0]?.recipient_key ?? '');
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState(replyTo
    ? (replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`)
    : '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // A family names the learner a message is about when several could apply.
  const recipient = recipients?.find(r => r.recipient_key === to);
  const learnerChoices = replyTo ? [] : learners.filter(l => !recipient?.student_ids || recipient.student_ids.includes(l.id));

  async function handleSubmit(e) {
    e.preventDefault();
    if ((!replyTo && !to) || !subject.trim() || !body.trim()) {
      toast.error('Destinataire, objet et message sont requis.');
      return;
    }
    if (learnerChoices.length > 1 && !studentId) {
      toast.error('Choisissez l’apprenant concerné.');
      return;
    }
    setSending(true);
    try {
      const ids = await sendPortalMessage({
        recipientKey: replyTo ? null : to,
        subject: subject.trim(),
        body: body.trim(),
        replyToId: replyTo?.id || null,
        studentId: studentId || (learnerChoices.length === 1 ? learnerChoices[0].id : null),
      });
      // Notify each recipient account by e-mail so a new message isn't missed
      // between logins. Best-effort: the message is already saved, and the
      // server picks the recipient and the fixed sender.
      for (const id of ids) {
        try { await integrations.Core.SendEmail({ message_id: id }); } catch { /* courtesy nudge */ }
      }
      toast.success('Message envoyé');
      onSent?.();
      onClose();
    } catch (error) {
      toast.error(portalErrorMessage(error, 'Message non envoyé. Réessayez.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">
          {replyTo ? 'Répondre' : 'Nouveau message'}
        </p>
        <button type="button" onClick={onClose} aria-label="Fermer" className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      <div>
        <label htmlFor="portal-message-to" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          À
        </label>
        {replyTo ? (
          <p id="portal-message-to" className="text-sm">{replyTo.counterpart}</p>
        ) : recipients?.length > 0 ? (
          <select
            id="portal-message-to"
            value={to}
            onChange={e => { setTo(e.target.value); setStudentId(''); }}
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
          >
            {recipients.map(r => (
              <option key={r.recipient_key} value={r.recipient_key}>{r.label}</option>
            ))}
          </select>
        ) : (
          <p id="portal-message-to" className="text-sm text-muted-foreground">Aucun destinataire disponible pour le moment.</p>
        )}
      </div>

      {learnerChoices.length > 1 && (
        <div>
          <label htmlFor="portal-message-learner" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Apprenant concerné
          </label>
          <select
            id="portal-message-learner"
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
            required
          >
            <option value="">— Choisir —</option>
            {learnerChoices.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="portal-message-subject" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Objet
        </label>
        <input
          id="portal-message-subject"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          maxLength={200}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
          required
        />
      </div>

      <div>
        <label htmlFor="portal-message-body" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Message
        </label>
        <textarea
          id="portal-message-body"
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={4000}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white h-32 resize-none"
          required
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">
          Annuler
        </button>
        <button
          type="submit"
          disabled={sending || (!replyTo && !recipients?.length)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 disabled:opacity-50"
        >
          <Send size={14} /> {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </form>
  );
}

export default function MessagesTab({ learners = [], onUnreadChange }) {
  // learners: [{ id, full_name }] — a family's linked learners, to name the
  // learner a message is about. Teachers pass none.
  const [view, setView]       = useState('inbox'); // inbox | sent
  const [opened, setOpened]   = useState(null);    // currently-open message
  const [replying, setReplying] = useState(null);  // reply target
  const [composing, setComposing] = useState(false);

  const inbox = useQuery({ queryKey: ['portal-messages', 'inbox'], queryFn: () => getMyMessages('inbox') });
  const sent  = useQuery({ queryKey: ['portal-messages', 'sent'], queryFn: () => getMyMessages('sent') });
  const recipients = useQuery({ queryKey: ['portal-message-recipients'], queryFn: getMessageRecipients });

  const items = view === 'inbox' ? (inbox.data || []) : (sent.data || []);
  const loading = view === 'inbox' ? inbox.isLoading : sent.isLoading;

  const unread = useMemo(
    () => (inbox.data || []).filter(m => !m.read).length,
    [inbox.data]
  );

  async function handleOpen(msg) {
    setOpened(msg);
    // Auto-mark as read on first open of an inbox message.
    if (view === 'inbox' && !msg.read) {
      try {
        await markMessageRead(msg.id);
        const refreshed = await inbox.refetch();
        onUnreadChange?.((refreshed.data || []).filter(m => !m.read).length);
      } catch { /* swallow — the user already saw the message */ }
    }
  }

  // ── Compose / reply view ─────────────────────────────────────────────
  if (composing || replying) {
    return (
      <ComposeForm
        recipients={recipients.data || []}
        learners={learners}
        replyTo={replying}
        onClose={() => { setComposing(false); setReplying(null); }}
        onSent={() => {
          inbox.refetch();
          sent.refetch();
        }}
      />
    );
  }

  // ── Single-message view ──────────────────────────────────────────────
  if (opened) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <button
          onClick={() => setOpened(null)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
        >
          <ChevronLeft size={13} /> Retour
        </button>
        <h3 className="font-semibold text-lg">{opened.subject}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {view === 'inbox' ? 'De' : 'À'} <strong>{opened.counterpart}</strong>
          {' · '}{fmtDate(opened.created_at)}
        </p>
        <div className="mt-4 text-sm whitespace-pre-wrap text-foreground/90">
          {opened.body}
        </div>
        {view === 'inbox' && opened.can_reply && (
          <button
            onClick={() => setReplying(opened)}
            className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90"
          >
            <Reply size={14} /> Répondre
          </button>
        )}
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border border-border rounded-lg p-1 bg-muted">
          <button
            onClick={() => setView('inbox')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              view === 'inbox' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <Inbox size={12} /> Boîte de réception
            {unread > 0 && (
              <span className="ml-1 inline-flex items-center justify-center text-[10px] font-bold text-white bg-primary rounded-full w-4 h-4">
                {unread}
              </span>
            )}
          </button>
          <button
            onClick={() => setView('sent')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              view === 'sent' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <Send size={12} /> Envoyés
          </button>
        </div>
        <button
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-md bg-primary hover:opacity-90"
        >
          <Mail size={12} /> Nouveau message
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3 space-y-2">
                <div className="h-3 w-1/3 bg-muted rounded" />
                <div className="h-3 w-2/3 bg-muted/70 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <MessageList
            items={items}
            onOpen={handleOpen}
            showUnread={view === 'inbox'}
            emptyLabel={
              view === 'inbox'
                ? 'Aucun message reçu.'
                : 'Aucun message envoyé.'
            }
          />
        )}
      </div>
    </div>
  );
}
