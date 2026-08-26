# Document Control QMS validation traceability matrix

This matrix links implemented critical requirements to design and repeatable
evidence. “Automated pass” means the cited test is executed by CI; it is not a
claim of regulatory certification.

| ID | User requirement | Functional/design control | Automated evidence | RC status |
| --- | --- | --- | --- | --- |
| UR-001 | Users access only authorized tenant records | Session-derived organization context, RBAC grants, composite tenant keys | `authorization.test.ts`, `tenant-context.test.ts`, database integrity SQL | Automated pass required |
| UR-002 | Controlled documents follow valid lifecycle transitions | Central lifecycle state machine plus optimistic lock version | `lifecycle.test.ts`, `service.test.ts` | Automated pass required |
| UR-003 | Every revision preserves controlled content and change evidence | Immutable version rows, server hash, successor-revision linkage | document service, query, diff, and dashboard tests | Automated pass required |
| UR-004 | Approval requires attributable electronic signature | Reauthentication event, signed payload hash, signature meaning | signature service and payload tests | Automated pass required |
| UR-005 | Review stages execute in order with accountable decisions | Active-task ownership, ordered workflow tasks, required comments | workflow-review and workflow UI tests | Automated pass required |
| UR-006 | Workflow configuration is controlled and versioned | Immutable workflow-definition versions, active-version control, audit events | workflow-template tests | Automated pass required |
| UR-007 | Review assignments may be transferred only by authorized users | Manager reassignment, assignee delegation, tenant/eligibility checks | workflow-review tests | Automated pass required |
| UR-008 | Effective documents receive periodic review and escalation | Periodic review tasks, overdue detection, idempotent notifications | review and notification tests | Automated pass required |
| UR-009 | Required acknowledgments are attributable and signed | Tenant assignment boundary and bound acknowledgment signature | acknowledgment service and payload tests | Automated pass required |
| UR-010 | Audit and authentication evidence cannot be silently changed | Database immutability triggers and append-only service behavior | `prisma/tests/integrity.sql`, security/session tests | Automated pass required |
| UR-011 | Operations can detect unhealthy dependencies without secret disclosure | Separate liveness/readiness and generic structured telemetry | readiness and telemetry tests, runtime smoke check | Automated pass required |
| UR-012 | Release artifacts are repeatable and recoverable | Dependency lockfile, frozen install, OCI build, backup/restore verification | CI, Security, restored-database integrity | Automated pass required |
| UR-013 | AWS validation releases are approved, immutable, and migration-gated | Protected OIDC workflow, digest-addressed images, reviewed change set, private one-time migration | AWS deployment-control and migration-contract tests; plan/apply evidence | Automated pass plus external approval required |

## External validation evidence

The controlled release record must attach the final CI and Security run URLs,
container digest, deployment SHA, migration output, recovery-exercise record,
critical-workflow UAT results, deviations, residual-risk approvals, and signed
quality/security/service-owner decision.
