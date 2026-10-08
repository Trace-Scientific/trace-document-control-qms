# Demo document population — governed execution contract

## Verified service path
`DocumentCommandService.createDraft(context, input)` requires `document.create`, a matching tenant organization, valid content, and a valid revision. `PrismaDocumentLifecycleStore.createDraft` persists a document, draft version, and audit event in one transaction.

## Safe implementation order
1. Provision the inactive demo organization only after Railway schema and organization-code preflight.
2. Provision a unique, controlled demo administrator credential using the existing first-administrator bootstrap. Credentials must be supplied through protected runtime secrets and removed immediately afterward.
3. Provision fictional staff using authenticated administration flows, not credential inserts or shared passwords.
4. Configure demo document types and roles in the demo organization.
5. Authenticate as a demo user with `document.create` and call `DocumentCommandService.createDraft` with:
   - organizationId from authenticated demo context, never from an untrusted catalog value;
   - documentTypeId resolved within the same organization;
   - documentNumber from the DEMO manifest;
   - versionNumber 1 and revisionLabel "0.1";
   - contentText containing an explicit synthetic/training disclaimer;
   - contentHash computed as SHA-256 of exact contentText;
   - changeSummary "Initial fictional demonstration draft".
6. For each manifest document, check for an existing tenant-qualified documentNumber and skip matching drafts; fail on collisions with non-demo content. Do not overwrite any version.
7. Use authenticated review, signature, and effectiveness workflows separately to demonstrate later states. Never create signature or approval records with a seed script.
8. Keep attachments disabled until the scanner and private-storage controls are verified.

## Release gates
- No automatic production seed on application startup or migration.
- No real or synthetic user email may be inferred from names; demo identities require explicit secure onboarding.
- Verify cross-tenant authorization regression, idempotent dry-run, and no mutation of unrelated tenants.
- Require human review of planned mutations and current Railway deployed SHA before apply.

## Current boundary
The draft PR includes a create-only, inactive-organization utility and a manifest. It does **not** yet implement authenticated user creation, document-type creation, or governed draft-population. The utility must not be treated as an end-to-end demo installer.
