# Commercial approval audit monitoring: implementation plan

Current production behavior: authorized platform users can request an on-demand audit summary. It does not run on a schedule or send alerts.

Next implementation steps:

1. Add a durable scan record with timestamp, triggering identity, aggregate counts, and finding categories. Keep snapshots separate from the source proposal and event tables.
2. Provide an authorized API for manually recording and reading scan history. Verify that counts are derived server-side from the existing read-only audit view.
3. Introduce a scheduler only after establishing an authenticated worker identity, concurrency controls, retries, and idempotency.
4. Send alerts only for new or changed findings. Reuse the existing platform notification delivery infrastructure, with explicit recipient authorization.
5. Test database migrations, access denial, concurrent scans, and duplicate notification prevention using isolated integration databases.

Safety boundaries: no automated repair of commercial approvals; no production database testing; do not expose customer snapshots in notifications. A scan with no findings is not proof of immunity to privileged database tampering.
