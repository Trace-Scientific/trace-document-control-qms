# UM-QMS-001 Governed Draft Assembly

Baseline: `2652028969dc610656433941a16d2b2b1302e1a7`

## Purpose

Convert the reviewed source-controlled manual drafts into governed manual records without publishing them or assigning an effective date.

## Assembly action

Authorized platform Help managers receive an explicit **Assemble reviewed draft v0.1** action.

The action requires:

- authenticated platform context;
- `platform.help.manage`;
- an operator-supplied controlled reason.

The operation is transactional and serialized with a database advisory lock.

## Idempotent behavior

The assembly operation:

1. locates or creates `UM-QMS-001 — Trace QMS Controlled User Manual`;
2. locates or creates each of the sixteen canonical manual sections;
3. reuses an existing section revision when its body and change summary exactly match the reviewed source;
4. otherwise appends a new immutable section revision;
5. locates or creates release version `0.1`;
6. requires that version `0.1` remain `DRAFT`;
7. sets the release composition to exactly the reviewed revision IDs in canonical order;
8. writes release events and a platform audit event.

Repeated execution with unchanged reviewed source does not create duplicate revisions or duplicate release versions.

## Effective-date boundary

A draft release may now have `effectiveAt = NULL`.

This is intentional: assembly is not scheduling.

The database prevents transition to `PUBLISHED` when `effectiveAt` is null. The application service independently rejects publication without an effective date.

User-facing manual queries also require:

- status = `PUBLISHED`;
- a non-null effective date; and
- `effectiveAt <= CURRENT_TIMESTAMP`.

This provides defense in depth if route-level filtering changes later.

## Publication boundary

This slice does **not**:

- publish release 0.1;
- assign its effective date;
- make it visible to ordinary authenticated QMS users;
- change tenant RBAC;
- create signatures or tenant approvals;
- modify tenant QMS records.

A later publication-readiness slice must inspect the assembled draft, deliberately set release metadata/effective date, and then perform a separate publish action.
