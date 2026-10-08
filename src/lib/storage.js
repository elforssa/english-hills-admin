// Registry-backed Storage only. The browser reserves an immutable key, uploads
// once, and the server verifies the bytes before a record binding can activate.

'use client';

import { getBrowserClient } from './supabase';

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

export async function resolveSignedUrl(stored) {
  if (!stored) return stored ?? null;
  if (stored.startsWith('asset:')) {
    const response = await fetch('/api/storage/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: stored.slice(6) }), cache: 'no-store' });
    if (!response.ok) throw new Error('Accès au fichier refusé');
    return (await response.json()).url;
  }
  // Unsaved local previews never address or authorize a Storage object.
  if (stored.startsWith('blob:')) return stored;
  throw new Error('Référence de fichier non autorisée');
}

export async function uploadAsset(file, { purpose, studentId = null, teacherId = null, enrollmentId = null }) {
  await validateFile(file);
  if (purpose.endsWith('_photo') && !file.type.startsWith('image/')) throw new Error('Une image est requise');
  const client = getBrowserClient();
  const { data: asset, error } = await client.rpc('reserve_storage_asset', {
    p_purpose: purpose, p_student_id: studentId, p_teacher_id: teacherId, p_enrollment_id: enrollmentId,
  });
  if (error) throw new Error('Réservation refusée');
  const { error: uploadError } = await client.storage.from(asset.bucket).upload(asset.path, file, { upsert: false, contentType: file.type, cacheControl: '0' });
  if (uploadError) throw new Error('Téléversement échoué');
  const response = await fetch('/api/storage/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: asset.id }) });
  if (!response.ok) throw new Error('Validation du fichier échouée');
  return { ref: `asset:${asset.id}`, url: `asset:${asset.id}` };
}

// Preserve the click gesture across asynchronous signing. No opener is left
// on the new window; denied/malformed references never navigate it.
export async function openStoredFile(stored) {
  const popup = window.open('about:blank', '_blank');
  if (popup) popup.opener = null;
  try {
    const url = await resolveSignedUrl(stored);
    if (!/^https?:\/\//i.test(url || '')) throw new Error('Invalid file URL');
    if (popup) popup.location.replace(url);
    else window.location.assign(url); // Browser disallows popups: same-tab download.
  } catch (error) {
    if (popup) popup.close();
    throw error;
  }
}
