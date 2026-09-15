# Photo-consent storage cleanup (manual production step)

The application and all outputs stop reading or writing the former
`photo_consent` fields in migration 055's application release. Historical
values are deliberately retained during the normal rollout.

After the release has been verified and the data-retention decision approved,
run `drop_photo_consent.sql` manually in a separately approved production
maintenance step. Do not add it to the automatic migration chain.
