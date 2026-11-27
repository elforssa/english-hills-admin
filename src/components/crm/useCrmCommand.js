'use client';

import { useRef, useState } from 'react';
import { crmRpc, useCrmRefresh } from '@/lib/crm/queries';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';

// RWR-r5 §4.9 request discipline, as CrmActionDialog: one key per submission, kept
// for every retry of that same submission (network retry, double tap) so the server
// replays the first result. While a request is in flight, `busy` disables the
// control and a second call is ignored. After an uncertain failure, a retry with
// the same `intent` resends the first payload with its key, never a payload rebuilt
// from the screen. A definitive refusal (stale version, validation, access) or a
// success ends the submission: the next call is a new one with a new key.
// Options (CPO-r2, « Je m'en occupe »): `onError` receives the refusal as it happens, so a
// caller that disappears with the refreshed list can still tell the user; `refreshOnConflict`
// reloads the lists after a stale-version refusal, since the screen is then known to be old.
export function useCrmCommand({ refreshOnConflict = false, onError } = {}) {
  const request = useRef(null), locked = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const refresh = useCrmRefresh();
  async function run(command, buildData, intent) {
    if (locked.current) return null;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const signature = JSON.stringify([command, intent]);
      // buildData() throws the form's own validation before any request exists.
      if (request.current?.signature !== signature) { const data = buildData(); request.current = { signature, key: crypto.randomUUID(), command, data }; }
      const saved = await crmRpc(request.current.command, { p_request_key: request.current.key, p_data: request.current.data });
      request.current = null;
      await refresh();
      return saved;
    } catch (err) {
      // Only a definitive refusal ends the submission. A transport failure (no code, or a
      // gateway body) keeps the request so the retry resends the same key and payload.
      if (isRecordConflict(err) || ['22023', '42501', '23514'].includes(err?.code)) request.current = null;
      setError(err);
      // Refresh first: the message then says « La liste est à jour » about a list that is.
      if (refreshOnConflict && isRecordConflict(err)) await refresh();
      onError?.(err);
      return null;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, clearError: () => setError(null) };
}
