'use client';

// =============================================================================
// MessagesTab — shared inbox/sent panel for parent + teacher portals.
//
// Reads/writes public.messages (schema lives in migration 001). The table
// already supports threading via reply_to_id but the portal UI is kept
// flat — replies show as new rows in the same conversation, sorted by
// created_at. Threading proper can come later without a schema change.
//
// What the tab does:
//   • Inbox  : messages where to_user_email = me.
//   • Envoyés: messages where from_user_email = me.
//   • Compose: send a new message to a chosen recipient. The recipient
//              list is supplied by the host portal (parent → admin/teacher,
//              teacher → admin/parent/student) so this component stays
//              context-agnostic.
//   • Reply  : open a thread, reply inline. Reply rows mark `reply_to_id`
//              so a future thread view can stitch them together.
//   • Read   : opening a message flips `read=true` for inbox rows.
// =============================================================================

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Inbox, Send, Mail, ChevronLeft, Reply, X } from 'lucide-react';
import { useEntityCreate, useEntityFilter, useEntityUpdate } from '@/lib/queries';
import { integrations } from '@/lib/entities';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-MA', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function MessageList({ items, onOpen, emptyLabel, showFrom = true }) {
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
                showFrom && !m.read ? 'bg-primary' : 'bg-transparent'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className={`text-sm truncate ${showFrom && !m.read ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                  {showFrom ? (m.from_name || m.from_user_email) : (m.to_name || m.to_user_email)}
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

function ComposeForm({ from, recipients, defaultTo, defaultSubject, replyTo, onClose, onSent }) {
  const [to, setTo] = useState(defaultTo || (recipients?.[0]?.email ?? ''));
  const [subject, setSubject] = useState(defaultSubject || '');
  const [body, setBody] = useState('');
  const create = useEntityCreate('Message');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!to || !subject.trim() || !body.trim()) {
      toast.error('Destinataire, objet et message sont requis.');
      return;
    }
    const recipient = recipients?.find(r => r.email === to);
    await create.mutateAsync({
      from_user_email: from.email,
      from_name:       from.name,
      to_user_email:   to,
      to_name:         recipient?.name || null,
      subject:         subject.trim(),
      body:            body.trim(),
      type:            'message',
      reply_to_id:     replyTo?.id || null,
      read:            false,
    });

    // Notify the recipient by email so a new message isn't missed between
    // logins. Best-effort: the message is already saved, so a failed email
    // must not block the success path.
    try {
      await integrations.Core.SendEmail({
        to: to,
        subject: `Nouveau message de ${from.name || from.email}`,
        body:
          `Bonjour,\n\n${from.name || from.email} vous a envoyé un message ` +
          `via l'espace English Hills :\n\n` +
          `Objet : ${subject.trim()}\n\n${body.trim()}\n\n` +
          `Connectez-vous à votre espace pour répondre.`,
        reply_to: from.email,
      });
    } catch {
      /* email is a courtesy nudge; the in-app message is the source of truth */
    }

    toast.success('Message envoyé');
    onSent?.();
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">
          {replyTo ? 'Répondre' : 'Nouveau message'}
        </p>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          À
        </label>
        {recipients?.length > 0 ? (
          <select
            value={to}
            onChange={e => setTo(e.target.value)}
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
            disabled={!!replyTo}
          >
            {recipients.map(r => (
              <option key={r.email} value={r.email}>
                {r.name ? `${r.name} (${r.email})` : r.email}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="email"
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="email@exemple.com"
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
            disabled={!!replyTo}
            required
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Objet
        </label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          maxLength={200}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Message
        </label>
        <textarea
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
          disabled={create.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 disabled:opacity-50"
        >
          <Send size={14} /> {create.isPending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </form>
  );
}

export default function MessagesTab({ me, recipients = [] }) {
  // me: { email, name }  — viewer identity (already loaded by the portal).
  // recipients: [{ email, name? }] — list shown in the compose dropdown.
  const [view, setView]       = useState('inbox'); // inbox | sent
  const [opened, setOpened]   = useState(null);    // currently-open message
  const [replying, setReplying] = useState(null);  // reply target
  const [composing, setComposing] = useState(false);

  // Two filtered queries — each gets its own cache key so they update
  // independently when the user sends/receives.
  const inbox = useEntityFilter('Message', { to_user_email: me?.email }, '-created_date', 200);
  const sent  = useEntityFilter('Message', { from_user_email: me?.email }, '-created_date', 200);

  const updateMessage = useEntityUpdate('Message');

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
        await updateMessage.mutateAsync({ id: msg.id, data: { read: true } });
      } catch { /* swallow — the user already saw the message */ }
    }
  }

  // ── Compose / reply view ─────────────────────────────────────────────
  if (composing || replying) {
    return (
      <ComposeForm
        from={me}
        recipients={recipients}
        defaultTo={replying ? replying.from_user_email : undefined}
        defaultSubject={
          replying
            ? (replying.subject?.startsWith('Re:') ? replying.subject : `Re: ${replying.subject}`)
            : ''
        }
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
          De <strong>{opened.from_name || opened.from_user_email}</strong>
          {' '}à <strong>{opened.to_name || opened.to_user_email}</strong>
          {' · '}{fmtDate(opened.created_at)}
        </p>
        <div className="mt-4 text-sm whitespace-pre-wrap text-foreground/90">
          {opened.body}
        </div>
        {view === 'inbox' && (
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
            showFrom={view === 'inbox'}
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
