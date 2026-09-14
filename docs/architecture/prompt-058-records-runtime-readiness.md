# Prompt 058 — Records runtime readiness repair

## UAT finding

During the 2026-09-14 production-deployed Records completeness review, creation of the first synthetic governed record type returned `Record type operation failed`. The `/api/records/types` route reserves that response for unexpected server-side failures; authentication, authorization, request validation, and governed validation failures have distinct responses.

The Records client also treats failed list requests as empty collections, so an empty Record library or Record types screen is not sufficient evidence that the runtime schema is healthy.

## Repair

- Add migration `0082_records_runtime_readiness` as an idempotent reconciliation of the Records foundation introduced by migration `0019_record_management_foundation`.
- Ensure `QualityRecordStatus`, `RecordType`, `QualityRecord`, indexes, foreign/unique constraints, Records permissions, and System Administrator permission assignments exist.
- Preserve existing Records rows and governed history; the migration uses `IF NOT EXISTS` / catalog checks and does not delete or rewrite business data.
- Add server-side logging for unexpected Record Type list/create failures while keeping database details out of the user-visible API response.

## Governance

The migration is intended to repair migration-history/schema drift without weakening authorization or audit controls. Record Type creation remains an audited transaction. Record creation still requires an active governed Record Type; archiving remains subject to retention/legal-hold disposition controls; export remains permission-gated and integrity-checked.

## Deployed regression UAT

After merge and migration deployment:

1. Reopen Records → Record types.
2. Create `UAT-REC-TYPE-001 — Synthetic UAT Record` with the approved synthetic description.
3. Confirm the type persists and is selectable under Create record.
4. Create one synthetic governed record and confirm it appears in Record library with ACTIVE status and immutable record identity.
5. Continue Records acceptance testing for archive/retention behavior only if required by the completeness review.
