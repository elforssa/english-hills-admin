begin;

-- Explicit director correction, never an automatic cleanup of cancelled payments.
-- Cancelling only a payment remains a separate operation: its debt may be valid.
create or replace function public.delete_mistaken_receipt(
  p_receipt_id uuid, p_reason text, p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_receipt public.receipts%rowtype;
  v_charge public.charges%rowtype;
  v_charge_id uuid;
begin
  if auth.uid() is null or public.get_my_role() is distinct from 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is null then raise exception 'An idempotency key is required.'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'Indiquez le motif de suppression.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_idempotency_key::text));

  select charge_id into v_charge_id from public.receipts where id=p_receipt_id;
  if not found then raise exception 'Reçu introuvable.'; end if;
  -- Payments lock the charge before inserting a receipt. Use the same lock order
  -- so a concurrent installment cannot be silently cancelled or orphaned.
  if v_charge_id is not null then
    select * into v_charge from public.charges where id=v_charge_id for update;
  end if;
  select * into v_receipt from public.receipts where id=p_receipt_id for update;
  if v_receipt.charge_id is distinct from v_charge_id then
    raise exception 'Le reçu a changé. Rechargez la page.';
  end if;
  if v_receipt.deleted_at is not null and (v_charge_id is null or v_charge.voided_at is not null) then
    return jsonb_build_object('receipt_id',p_receipt_id,'already_deleted',true);
  end if;
  if exists (select 1 from public.receipts where charge_id=v_charge_id
    and id<>p_receipt_id and voided_at is null and deleted_at is null) then
    raise exception 'D’autres paiements actifs sont liés à cet engagement. Utilisez la correction du paiement uniquement.';
  end if;

  update public.receipts set deleted_at=coalesce(deleted_at,now()),
    voided_at=coalesce(voided_at,now()), voided_by=coalesce(voided_by,auth.uid()),
    void_reason=coalesce(void_reason,btrim(p_reason)), email_delivery_status='skipped'
  where id=p_receipt_id;
  insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
  values ('payment_voided',v_charge_id,p_receipt_id,auth.uid(),jsonb_build_object(
    'action','delete_mistaken_receipt','reason',btrim(p_reason),
    'idempotency_key',p_idempotency_key,'receipt_number',v_receipt.receipt_number,
    'amount',v_receipt.montant_paye,
    'removed_from_collected',case when v_receipt.voided_at is null and v_receipt.deleted_at is null then v_receipt.montant_paye else 0 end));
  if v_charge_id is not null and v_charge.voided_at is null then
    update public.charges set voided_at=now(),voided_by=auth.uid(),
      void_reason=btrim(p_reason),updated_at=now() where id=v_charge_id;
    insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
    values ('charge_voided',v_charge_id,p_receipt_id,auth.uid(),jsonb_build_object(
      'action','delete_mistaken_receipt','reason',btrim(p_reason),'idempotency_key',p_idempotency_key));
  end if;
  return jsonb_build_object('receipt_id',p_receipt_id,'charge_id',v_charge_id,'already_deleted',false);
end;
$$;
revoke all on function public.delete_mistaken_receipt(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.delete_mistaken_receipt(uuid,text,uuid) to authenticated;
commit;
