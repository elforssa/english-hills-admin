// =============================================================================
// integrations — file/email helpers: integrations.Core.{UploadFile, SendEmail}
//
//   • UploadFile  → src/lib/storage.js (Supabase Storage, signed URLs)
//   • SendEmail   → POST /api/email/send (auth-gated proxy to src/lib/email.js)
//
// See src/lib/storage.js and src/lib/email.js for the per-helper docs.
// =============================================================================

'use client';

import { toast } from 'sonner';
import { uploadFile } from './storage';

const DEFAULT_UPLOAD_BUCKET = 'documents';

export const integrations = {
  Core: {
    /**
     * UploadFile({ file, bucket?, folder? }) → Promise<{ file_url, file_name }>
     *
     * Defaults bucket to 'documents'. Returns `{ file_url, file_name }`.
     */
    async UploadFile({ file, bucket = DEFAULT_UPLOAD_BUCKET, folder = '' } = {}) {
      if (!file) throw new Error('UploadFile: missing `file`');
      try {
        const { url, ref } = await uploadFile(bucket, file, folder);
        // `file_ref` ("bucket/path") is preferred for storage — re-sign it on
        // demand with resolveSignedUrl(). `file_url` stays for callers that
        // still persist a ready URL (now 90-day, not 1-year).
        return { file_url: url, file_ref: ref, file_name: file.name };
      } catch (err) {
        toast.error(`Upload échoué : ${err.message || 'erreur inconnue'}`);
        throw err;
      }
    },

    /**
     * SendEmail({ to, subject, body, html?, reply_to? }) → Promise<{ success, id }>
     *
     * POSTs to /api/email/send. Throws on non-2xx and shows a sonner toast.
     * Note: the sender's display name is derived server-side from the
     * caller's profile — callers cannot spoof it via `from_name`.
     */
    async SendEmail({ to, subject, body, html, reply_to } = {}) {
      const res = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to, subject, body, html, reply_to }),
      });

      if (!res.ok) {
        let detail = `${res.status}`;
        try {
          const err = await res.json();
          detail = err.error || detail;
        } catch { /* response not JSON */ }
        toast.error(`Email échoué : ${detail}`);
        throw new Error(`SendEmail failed: ${detail}`);
      }

      return res.json();
    },
  },
};
