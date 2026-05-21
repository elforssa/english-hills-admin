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
        const { url } = await uploadFile(bucket, file, folder);
        return { file_url: url, file_name: file.name };
      } catch (err) {
        toast.error(`Upload échoué : ${err.message || 'erreur inconnue'}`);
        throw err;
      }
    },

    /**
     * SendEmail({ to, subject, body, from_name? }) → Promise<{ success, id }>
     *
     * POSTs to /api/email/send. Throws on non-2xx and shows a sonner toast.
     */
    async SendEmail({ to, subject, body, from_name, html, reply_to } = {}) {
      const res = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to, subject, body, from_name, html, reply_to }),
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
