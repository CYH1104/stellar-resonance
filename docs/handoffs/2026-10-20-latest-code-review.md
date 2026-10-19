# Latest local code review

Reviewed against shared main `141455c079d116a0ab1c60e17b40195e641098b5`.
The remote branch had no later commit; the local tree includes unpublished delta-roster, per-character commit/review and revision-checked storage work.

## Confirmed and fixed

1. Disabled state processing still parsed new `present/enter/exit` claims, so a conflicting roster could reject a response and a valid exit could affect retained presence. Ignore those fields before decoding and in compatibility normalization.
2. Targeted affinity repair used the complete delta-roster required set for diagnostics, incorrectly flagging already accepted actors. Restrict review requirements and verdicts to the requested IDs.
3. A model-generated alternate ID with a uniquely matching existing name was reconciled too late. MVU preparation could register a duplicate and conflict with roster validation. Normalize identities, rows and roster references before registration and review. Explicit existing IDs remain authoritative; ambiguous name matches are not guessed.
4. Dictionary-form `characters` normalized for presence but bypassed embedded attitude extraction. Normalize both forms through the same path.
5. A null/non-object character row could throw while destructuring embedded reviews. Skip only that row with `STATE_FIELD_SKIPPED`; retain valid rows.

The five new regression tests failed before the fixes and pass afterwards.

## Validation

- Server: 280 tests passed.
- Client/domain/storage: 357 tests passed.
- TypeScript check passed.
- Production build passed (exit 0); the existing bundle-size advisory remains.
- No live-model or public-server deployment acceptance is claimed by this review.

Local logs are in `.integration/latest-review-{server,client,build}.log` and are excluded from publication.
