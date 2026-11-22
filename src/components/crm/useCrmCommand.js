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
export function useCrmCommand() {
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
      if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID(), command, data: buildData() };
      const saved = await crmRpc(request.current.command, { p_request_key: request.current.key, p_data: request.current.data });
      request.current = null;
      await refresh();
      return saved;
    } catch (err) {
      if (isRecordConflict(err) || ['22023', '42501', '23514'].includes(err?.code) || (err instanceof Error && !err.code)) request.current = null;
      setError(err);
      return null;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, clearError: () => setError(null) };
}
