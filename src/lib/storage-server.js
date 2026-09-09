import 'server-only';
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';
import { getServiceRoleClient } from '@/lib/supabase-admin';

export async function storageRequest(request, operation) {
  const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const client = await getServerClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return reply({ error: 'Not authenticated' }, 401);
    const body = await request.json();
    if (typeof body.assetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.assetId)) return reply({ error: 'Invalid asset' }, 400);
    // Only assetId is consumed: caller path, actor, metadata and expiry ignored.
    const { data: asset, error: denied } = await client.rpc(operation === 'sign' ? 'resolve_storage_asset' : 'get_storage_upload', { p_asset_id: body.assetId });
    if (denied || !asset) return reply({ error: 'Forbidden' }, 403);
    const backend = getServiceRoleClient();
    if (operation === 'sign') {
      const { data, error: signError } = await backend.storage.from(asset.bucket).createSignedUrl(asset.path, 300);
      if (signError) return reply({ error: 'File unavailable' }, 409);
      return reply({ url: data.signedUrl, expiresIn: 300 });
    }
    if (!asset.version || !Number.isFinite(asset.size) || asset.size <= 0 || asset.size > 10485760) return reply({ error: 'Invalid upload' }, 409);
    const { data: blob, error: downloadError } = await backend.storage.from(asset.bucket).download(asset.path);
    if (downloadError || !blob || blob.size !== asset.size) return reply({ error: 'Invalid upload' }, 409);
    const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const matches = signature => signature.every((byte, i) => bytes[i] === byte);
    const type = matches([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]) ? 'image/png'
      : matches([0xff,0xd8,0xff]) ? 'image/jpeg' : matches([0x25,0x50,0x44,0x46]) ? 'application/pdf' : null;
    if (!type || (asset.purpose.endsWith('_photo') && type === 'application/pdf')) return reply({ error: 'Unsupported content' }, 400);
    const { error: finalizeError } = await backend.rpc('finalize_storage_asset', {
      p_actor: user.id, p_asset_id: body.assetId, p_size: blob.size, p_type: type, p_version: asset.version,
    });
    if (finalizeError) return reply({ error: 'Upload no longer valid' }, 409);
    return reply({ ref: `asset:${body.assetId}` });
  } catch {
    // Never log request bodies, paths or signed tokens.
    return reply({ error: 'Storage request failed' }, 400);
  }
}
