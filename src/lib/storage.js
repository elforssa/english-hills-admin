// =============================================================================
// Storage helper — uploadFile(bucket, file)
//
// Uploads to a private Supabase Storage bucket and returns a long-lived
// signed URL. Safe to call from client components.
//
// Buckets `documents` and `portfolios` are both private (set in migration 004),
// so the bucket itself has no public access — clients must use signed URLs
// or signed-cookie auth. We return a 1-year signed URL for backward
// compatibility with the existing pattern of storing `file_url` directly in
// the database. For tighter security, store `{ bucket, path }` and call
// createSignedUrl on demand instead.
// =============================================================================

'use client';

import { getBrowserClient } from './supabase';

// Persisted-URL lifetime (for callers that still store a ready URL, e.g. the
// public enrollment form's documents_urls). Reduced from ~1 year so a leaked
// URL has a far smaller exposure window. Prefer storing a `ref` (below) and
// signing on demand with resolveSignedUrl() instead of persisting URLs.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 90; // 90 days
// Short-lived window used when re-signing a stored `bucket/path` ref at the
// moment a user actually opens the file.
const ON_DEMAND_EXPIRY_SECONDS = 60 * 60; // 1 hour
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png':  [0x89, 0x50, 0x4E, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};

async function validateFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Le fichier dépasse la taille maximale de 10 Mo.');
  }
  const allowedMimes = Object.keys(ALLOWED_TYPES);
  if (!allowedMimes.includes(file.type)) {
    throw new Error(`Type de fichier non autorisé. Formats acceptés : JPEG, PNG, PDF.`);
  }
  const magic = ALLOWED_TYPES[file.type];
  const header = new Uint8Array(await file.slice(0, magic.length).arrayBuffer());
  if (!magic.every((byte, i) => header[i] === byte)) {
    throw new Error('Le contenu du fichier ne correspond pas à son extension.');
  }
}

/**
 * uploadFile(bucket, file, folder?) → Promise<{ url, path, bucket }>
 *
 * @param {string} bucket  Bucket id ('documents' or 'portfolios').
 * @param {File}   file    Browser File object.
 * @param {string} [folder] Optional path prefix inside the bucket.
 *
 * Returns the signed URL (good for ~1 year), the storage path, and the
 * bucket id. The path/bucket are useful if you ever need to regenerate
 * a fresh URL.
 */
export async function uploadFile(bucket, file, folder = '') {
  if (!bucket) throw new Error('uploadFile: missing bucket');
  if (!file)   throw new Error('uploadFile: missing file');

  await validateFile(file);

  const sb       = getBrowserClient();
  const safeName = (file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp    = Date.now();
  const path     = folder ? `${folder}/${stamp}-${safeName}` : `${stamp}-${safeName}`;

  const { error: uploadErr } = await sb.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert:       false,
      contentType:  file.type || undefined,
    });
  if (uploadErr) throw uploadErr;

  const { data: signed, error: urlErr } = await sb.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (urlErr) throw urlErr;

  return {
    url:    signed.signedUrl,
    path,
    bucket,
    // Storage reference "bucket/path" — store THIS (not the URL) and re-sign on
    // demand via resolveSignedUrl() so no long-lived URL is persisted.
    ref:    `${bucket}/${path}`,
  };
}

/**
 * resolveSignedUrl(stored, expiresInSeconds?) → Promise<string|null>
 *
 * Turns a stored file value into a fresh, short-lived signed URL:
 *   • A legacy full URL ("https://…") is returned as-is (backward compat).
 *   • A "bucket/path" ref is re-signed on demand for a short window.
 * Call this at the moment the user opens the file, never ahead of time.
 */
export async function resolveSignedUrl(stored, expiresInSeconds = ON_DEMAND_EXPIRY_SECONDS) {
  if (!stored) return stored ?? null;
  if (/^https?:\/\//i.test(stored)) return stored; // legacy persisted URL
  const slash = stored.indexOf('/');
  if (slash < 1 || slash === stored.length - 1) return stored; // not a ref
  const bucket = stored.slice(0, slash);
  const path   = stored.slice(slash + 1);
  return createSignedUrl(bucket, path, expiresInSeconds);
}

/**
 * createSignedUrl(bucket, path, expiresInSeconds?) → Promise<string>
 *
 * Regenerates a signed URL for a previously-uploaded file. Use this when
 * the stored `file_url` has expired or when you want a short-lived URL.
 */
export async function createSignedUrl(bucket, path, expiresInSeconds = SIGNED_URL_EXPIRY_SECONDS) {
  const sb = getBrowserClient();
  const { data, error } = await sb.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
