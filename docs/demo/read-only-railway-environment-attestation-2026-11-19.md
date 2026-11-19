# Demo environment read-only attestation — November 19, 2026

**Disposition:** Railway infrastructure inventory and deployment identity verified via read-only API calls. This is **not** a database identity attestation, live authenticated tenant-isolation pass, or authorization for prospect credentials.

## Observed Railway target

| Field | Observed value |
| --- | --- |
| Railway project | `e6cc5f1e-3064-46d3-90bf-c763334f01a8` |
| Environment | `demo` — `3bb1cae4-454f-4f6c-b2cb-fb38c8eb58a4`; non-ephemeral |
| Application service | `trace-qms-demo` — `9c8676bd-5d9b-4306-8e85-062bd95bf72c` |
| Service domain | `trace-qms-demo-demo.up.railway.app` (port 8080) |
| Source | `Trace-Scientific/trace-document-control-qms`, branch `main` |
| Application deployment | `58228691-c380-4f51-be91-7a6b000b7294`, SUCCESS |
| Deployed commit | `d54a1b7316163ba94666087b54d7d33f0c0a5e21` (PR #477) |
| Application replicas | 1 running, 0 crashed |
| Environment health | 6 services checked, 0 with issues, 0 recent failed/crashed deployments |
| Staged work | None reported |
| Database service | `Postgres-6QrB` — `7f2ad369-c21a-486a-8ac4-4a170b1674d3`, online; deployment SUCCESS |
| Backup service | `trace-qms-demo-s3-backup`, cron ready |
| Restore-validation service | `trace-qms-demo-restore-validation`, latest deployment SUCCESS |
| Preflight service | `trace-qms-demo-preflight`, latest deployment SUCCESS |
| Provisioner service | `trace-qms-demo-provisioner`, latest deployment SUCCESS |

**Evidence source:** Railway `list_services`, `list_deployments`, `describe_environment`, `describe_service`, and `environment_status` read-only results inspected on November 19, 2026 UTC. No database queries were executed.

## What this establishes

- The separate demo Railway environment exists and has a successful application deployment from the merged PR #477 commit.
- The demo service has a configured public domain, and Railway reports its app replica running.
- The six demo services reported no health issues or pending staged changes at inspection time.
- The deployed commit can be distinguished from the separate Railway environment named `production`, which is a synthetic development preview.

## What remains unverified

- **Database identity:** The Railway inventory names the PostgreSQL service, but does not prove the application's resolved `DATABASE_URL` points exclusively to that database. Do not disclose or copy secret values. Independent non-secret identity attestation is still needed.
- **Synthetic persona inventory:** No authenticated user/account inventory was performed. Lab B remains inactive, with no users/documents per PR #458's earlier evidence.
- **ISO-01/02/03/05:** No live authenticated negative security tests were performed. Disposable CI results are not substitutes.
- **REC-01:** The previously recorded checksum-verified isolated restore still requires named independent reviewer sign-off.
- **REC-02:** Reset/rollback isolation and production boundary require separate attestation; do not perform a live reset without authorization.
- **ISO-06:** Scope beyond the issue #459 walkthrough remains unsigned.
- **OPS-01:** No approval to issue prospect credentials.

## Required decisions before any live changes

1. Designate the independent reviewer for the existing restore evidence and environment/database identity.
2. Determine whether the current approved synthetic personas can support the live tests. If not, explicitly approve or decline a *separate* test fixture plan, including tenant activation, account creation, grants, data, and cleanup.
3. Authorize the specific live authenticated negative tests and evidence capture before execution.
4. Complete the owner/security prospect-access decision only after applicable acceptance gates close.

**Restrictions:** No live database writes, Lab B activation, credential issuance, role changes, or restore operations were performed or authorized by this document.

See [prospect readiness packet](prospect-go-no-go-readiness-2026-11-19.md) and [security acceptance matrix](security-acceptance-matrix.md).
