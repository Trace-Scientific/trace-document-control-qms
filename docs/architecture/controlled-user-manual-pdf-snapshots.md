# Controlled User Manual PDF Snapshots

Status: launch-readiness slice for Help Center issue #233.

## Purpose

Provide a release-specific retained PDF representation of a controlled user-manual release without changing the manual lifecycle.

A snapshot is evidence of the exact release composition at generation time. It is not a publication action, effective-date action, tenant SOP, approval signature, or training record.

## Governance

- Generation requires `platform.help.manage`.
- The source release may be DRAFT, PUBLISHED, or ARCHIVED; its source status is rendered into the PDF.
- The ordered `UserManualReleaseSection` composition is resolved to exact immutable `UserManualSectionRevision` IDs.
- Snapshot metadata stores those exact revision IDs, SHA-256, size, storage key, actor identity/membership, reason, and creation time.
- Snapshot rows are database-immutable.
- PDF bytes are retained in private object storage under a platform-scoped key.
- Download recomputes SHA-256 before returning bytes.
- Creation and download are recorded in `PlatformAuditEvent`.

## User experience

Platform Administration → Help & User Manual lists retained snapshots per release and allows an authorized platform administrator to generate or download them.

Generating a snapshot does not:
- publish a DRAFT release;
- assign or change an effective date;
- change tenant permissions;
- create a regulated approval/signature;
- replace customer SOPs; or
- create training/acknowledgement evidence.

## Retention boundary

The snapshot record and object are intentionally not exposed through tenant `FileObject` because that model is tenant-scoped. Customer-package delivery and any tenant-facing published-manual download policy remain separate controlled concerns.

## Validation focus

Automated coverage verifies PDF structure, immutable metadata, permission enforcement, private storage use, exact revision-ID evidence, integrity checking, and UI publication-boundary language.
