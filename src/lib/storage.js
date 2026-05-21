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

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 365; // ~1 year

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
  };
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
