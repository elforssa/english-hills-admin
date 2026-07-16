-- "Comment avez-vous connu le centre ?" — acquisition source, captured at the
-- desk during receipt creation. Stored on the student (one-time attribute, for
-- reporting) and snapshotted on the receipt; never printed on the reçu.
-- Paid ads are kept separate from organic social, which is what marketing tracks.

alter table public.students
  add column if not exists referral_source text
    check (referral_source is null or referral_source in (
      'Réseaux sociaux (Facebook / Instagram)',
      'Publicité payante (Ads)',
      'Recherche Google',
      'Famille / Ami(e)',
      'Passage devant le centre (walk-in)',
      'Ancien élève / Réinscription'
    ));

alter table public.receipts
  add column if not exists referral_source text
    check (referral_source is null or referral_source in (
      'Réseaux sociaux (Facebook / Instagram)',
      'Publicité payante (Ads)',
      'Recherche Google',
      'Famille / Ami(e)',
      'Passage devant le centre (walk-in)',
      'Ancien élève / Réinscription'
    ));
