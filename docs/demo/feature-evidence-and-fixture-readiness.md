# Demo feature evidence and fixture readiness

**Source-code inspection only, not deployed acceptance testing.** The following evidence is based on files reviewed on the PR #421 branch. No demo tenant or records were created.

| Demo capability | Source evidence | Assessment | Required before live demo |
| --- | --- | --- | --- |
| Draft, revision and lifecycle transitions | `src/lib/documents/service.ts` defines createDraft, createRevision, updateDraft and SUBMIT/APPROVE/REJECT/MAKE_EFFECTIVE/RETIRE permissions | Implemented service interfaces and command paths visible | Verify UI, migrations, and role-specific end-to-end behavior in isolated demo |
| Workflow templates | `src/lib/documents/workflow-template.ts`, `src/components/workflow-template-administration.tsx`, `src/app/api/documents/workflow/templates/route.ts` | Components and API exist | Verify review-stage assignment and approver behavior |
| Document acknowledgments | `src/lib/acknowledgments/service.ts`, `src/components/my-acknowledgments.tsx` | Assignment, recipient listing and password-verified completion code exists | Verify effective-document prerequisites, UI and actual audit evidence; do not claim formal compliance |
| Audit history | `src/app/api/audit/route.ts` | Authenticated, permission-gated, organization-scoped query with filtering and pagination | Verify rendered UI, authorized/unauthorized roles and tenant isolation |
| Role isolation | `src/lib/security/authorization` referenced by document and acknowledgment services | Authorization calls exist | Run negative tests with distinct synthetic accounts |
| Demo reset | No reset implementation verified in this inspection | **Unverified** | Identify and test approved reset/recovery mechanism before customer demos |
| Signature compliance | Acknowledgment password verification is visible; no regulatory validation performed | **Do not claim 21 CFR Part 11 compliance** | Independent regulatory/control validation before any such claim |

## Synthetic SOP text outline (non-operational)

Every example must display **SYNTHETIC — DEMONSTRATION ONLY — NOT FOR LABORATORY USE**. Avoid clinical acceptance criteria, QC limits, real patient information, or actual laboratory instructions.

### SOP-GEN-001 — Specimen Receipt and Acceptance — DEMO
Purpose: Illustrate document ownership and revision control. Sections: purpose; scope; responsible roles; placeholder receipt workflow; exception escalation placeholder; references; change history. Use generic placeholders instead of clinical procedures.

### SOP-QC-002 — Daily Quality Control Review — DEMO
Purpose: Demonstrate draft v1.1 review and approval. Sections: purpose; responsible roles; review record placeholder; discrepancy routing placeholder; revision history. No instrument-specific limits or patient testing decisions.

### SOP-SAF-003 — Laboratory Safety Orientation — DEMO
Purpose: Show controlled policy access. Sections: purpose; responsibilities; safety training placeholder; incident escalation placeholder; acknowledgment.

### POL-DOC-001 — Document Control Policy — DEMO
Purpose: Show controlled document hierarchy. Sections: ownership; review; approval; effective status; supersession; audit trail.

### FRM-DEV-001 — Nonconformance Report Form — DEMO
Purpose: Show a controlled blank template. Fields: fictional record ID, event summary, reviewer, status, resolution placeholder.

### WI-EQP-001 — Equipment Maintenance Log Instructions — DEMO
Purpose: Show revision metadata and search. Sections: purpose; responsible role; fictional equipment reference; log placeholder; change history.

## Recommended next implementation

1. Add these six synthetic, non-operational documents to a versioned fixture bundle **without** connecting to a live database.
2. Add fixture validation for unique IDs, DEMO labeling, non-empty content, and no real patient/customer information.
3. Test import/creation against an isolated disposable migrated database and record exact results.
4. Obtain separate demo-only write authorization before populating Railway.

This inventory does not prove deployed behavior. The external security review and PR #421 merge gate remain independent.
