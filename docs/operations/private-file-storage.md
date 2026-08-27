# Private controlled-file storage

Controlled file bytes are stored in a private S3-compatible bucket. Configure
the `OBJECT_STORAGE_*` variables through the deployment secret manager and deny
public bucket access. Uploads are limited to approved document formats and 25 MB,
bound to tenant-prefixed random keys, and recorded with SHA-256 metadata.

New uploads remain `PENDING_SCAN` and cannot be downloaded. An external malware
scanner must submit its result to `/api/internal/files/scan-result` using the
separate `FILE_SCAN_SECRET`. Clean files become `AVAILABLE`; malicious files are
`QUARANTINED`. The application recalculates SHA-256 on every download and records
the download in the append-only audit trail.

User-facing removal is logical archival only. Files bound to document versions
cannot be archived through the generic file endpoint. Physical destruction must
be implemented later as an independently authorized retention workflow that
checks record relationships and legal holds before deleting object bytes.
