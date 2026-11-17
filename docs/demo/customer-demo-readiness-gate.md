# Trace QMS customer demonstration readiness gate

Status: planning and read-only verification only. No demo environment has been activated or populated by this change.

## Goal
Provide prospective laboratory customers with an isolated, fully synthetic demonstration of governed document control and related QMS workflows without affecting existing customers or altering the production validation baseline.

## Confirmed repository baseline
- `scripts/provision-demo-tenant.mjs` is explicitly locked to a specific local integration-test PostgreSQL database.
- `scripts/activate-demo-tenant.mjs` requires a matching synthetic organization and refuses to activate a tenant with users or credentials.
- `scripts/configure-demo-organization.mjs` plans two sites, four departments, and four document types.
- `scripts/demo-tenant-manifest.mjs` includes six fictional personas and fifteen document entries.
- `scripts/populate-demo-drafts.mjs` creates drafts only through an authorized document service.
- The existing plan `docs/demo/demo-tenant-provisioning-plan.md` explicitly states the demo is not deployed or provisioned.

## Stage A: infrastructure and identity (blocking)
- [ ] Decide on a separate demonstration Railway environment and database, not the shared production database.
- [ ] Verify exact environment, database identity, migrations, backup/restore, secrets, private storage, and malware scanning.
- [ ] Implement environment-specific guarded provisioning, retaining the local test-only restriction on the current script.
- [ ] Confirm dry-run is read-only, apply requires explicit environment identity and confirmation, and repeat runs are idempotent.
- [ ] Provision individual fictional demo identities through governed identity operations; never commit credentials.

## Stage B: realistic synthetic content
- [ ] Expand the fifteen-document manifest to 25–35 documents with realistic categories and revision histories.
- [ ] Populate governed drafts through document services; never insert fabricated signatures, approvals, or audit events.
- [ ] Exercise distinct authorized demo users through review, approval, effective, and superseded lifecycles.
- [ ] Add synthetic training, competency, CAPA, equipment, and reporting examples only through approved services.

## Stage C: security and acceptance
- [ ] Test cross-tenant read/write isolation in both directions.
- [ ] Prove rejected tenant collisions, unauthorized provisioning, wrong database, and re-run safety.
- [ ] Verify demo reset/recovery and confirm no production records change.
- [ ] Run authenticated desktop/mobile smoke tests, workflows, dashboards, and PDF exports.
- [ ] Prepare a 15-minute prospect walkthrough and an operator reset/runbook.
- [ ] Obtain recorded product/security approval before sharing demo access.

## Observed interactive demo evidence — November 16, 2026

The existing Railway demo application was exercised manually with fictional users Alex Morgan, Daniel Brooks, and Emily Carter. This evidence concerns the existing demo organization; it **does not** authorize or establish completion of the separate `trace-demo-lab` provisioning plan.

- TEST-001, `QMS Workflow Verification — Demo`, v0.1: controlled draft created and automatically handed off to Controlled Submission with the correct draft selected.
- Daniel Brooks was assigned technical review with a November 20, 2026 due date; the review comment was recorded and his assignment became COMPLETED.
- Emily Carter's final-approval assignment became IN PROGRESS after technical review, then COMPLETED following the electronic-approval action. The document status became APPROVED.
- Alex Morgan made TEST-001 v0.1 EFFECTIVE; the document detail showed the Create successor revision action.
- Earlier FRM-002 demonstration showed v0.2 EFFECTIVE and v0.1 SUPERSEDED.
- During Emily's approval screen, reviewer-only action controls were also visible. PR #445 corrects the UI condition; its deployed behavior still requires confirmation.
- PR #446 improves exact-version draft selection beyond the first page of 50 drafts; its deployed behavior still requires confirmation.

**Evidence limits:** These observations do not establish database-level audit integrity, cross-tenant isolation, backup restore, demo reset, synthetic-data completeness, production validation, or customer-access approval. Do not mark the security and release gates complete on the basis of these screenshots.

### Remaining acceptance actions

1. Confirm the Railway demo service is running the expected merged commit and smoke-test the corrected approver controls.
2. Verify the existing demo dataset contains no real customer or patient information before external access.
3. Run the tenant-isolation, restore/reset, and access-permission checks in Stage C.
4. Prepare the prospect walkthrough and operator reset runbook, then record product/security sign-off.

## Commercial launch gates (separate from demo)
Complete release traceability, critical-workflow UAT, backup/restore exercise, documented residual risks, controlled User Manual release, customer onboarding and subscription verification, and final quality/security/product approvals. A Railway SUCCESS deployment is not validation approval.

## Decision
Do not remove or weaken `assertDemoTestDatabase` on existing scripts. Build a new explicit environment-specific provisioner after the infrastructure preflight is reviewed. Do not provision a production tenant or incur new cloud infrastructure charges without approval.
