# Disposable demo fixture import test design

**Status: design only. No importer or database write has been executed.** Do not run against Railway. Independent PR #421 security review remains required.

## Verified schema constraints

From `prisma/schema.prisma` and `src/lib/documents/prisma-store.ts`:
- A Document requires `organizationId`, `documentTypeId`, `documentNumber`, and `title`.
- A DocumentVersion requires an owning document and an author user; the service records `contentHash`, `contentText`, `revisionLabel`, `versionNumber`, and `changeSummary`.
- Document creation through `PrismaDocumentLifecycleStore.createDraft` uses a transaction and emits a genuine `DOCUMENT_DRAFT_CREATED` audit event.
- `src/lib/documents/lifecycle.ts` defines DRAFT -> IN_REVIEW -> APPROVED -> EFFECTIVE transitions, rather than directly assigning approved/effective states.

## Test plan for an isolated migrated PostgreSQL database

1. Start a disposable PostgreSQL 17 container; apply real Prisma migrations. Use a test-only connection string and refuse any host other than the isolated local container.
2. Create a fictional Organization, fictional author/reviewer/approver users, and the needed DocumentType records in a transaction; do not reuse Railway identities or data.
3. Run `node fixtures/demo/validate.mjs`; stop on any failure.
4. For each manifest document, load its UTF-8 text and compute lowercase SHA-256 of exact content.
5. Create each record through `DocumentCommandService.createDraft` with a valid authorization context and `PrismaDocumentLifecycleStore`. Avoid direct DocumentVersion inserts that bypass lifecycle and audit semantics.
6. Keep all six at DRAFT in the initial import. Manifest `approved` is **planned demonstration status**, not a license to bypass approval; drive SUBMIT/APPROVE/MAKE_EFFECTIVE only through supported commands with distinct authorized synthetic accounts.
7. Verify six documents and versions scoped to the fictional organization, unique document numbers, valid content hashes, and six actual draft-creation audit events. Check that an unrelated fictional organization sees none of the records.
8. Exercise valid and invalid lifecycle transitions and verify corresponding audit records. Verify acknowledgment assignment only after effective status and with proper authorized users.
9. Tear down the disposable container. No credentials, test rows, or audit records should reach Railway.

## Safety requirements for future test implementation

- Require explicit opt-in environment flag, test-only host assertion, disposable container label, and a preflight that rejects Railway connection strings.
- No hardcoded passwords or real user emails; use synthetic local credentials.
- Do not enable CI database secrets or connect the workflow to deployed Railway.
- Capture exact test output, PostgreSQL version, migration SHA, and fixture manifest SHA.
- A passing disposable test does not approve PR #421 or authorize live provisioning.

## Current gap

The repository has an offline fixture validator and the migrated-schema SQL integration workflow, but **no verified fixture importer or migrated-schema fixture import run**. This document is the implementation contract for that next step.
