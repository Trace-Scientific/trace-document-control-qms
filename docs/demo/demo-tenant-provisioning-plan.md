# Demo tenant provisioning — controlled implementation plan

Status: implementation specification; **not deployed or provisioned**.

## Purpose
Create a clearly labeled, isolated, synthetic-data laboratory demonstration organization in the existing Railway-hosted Trace QMS application. No changes to OCL-LIS, existing organizations, or rc.9 validation evidence.

## Identity and tenancy
- Proposed organization login code: `trace-demo-lab`.
- Display name: `Trace Scientific Demo Laboratory (SYNTHETIC)`.
- Legal name: `Trace Scientific Demonstration Laboratory — Fictional`.
- Timezone: `America/Los_Angeles`.
- Demo users must have fictional names and controlled, individually provisioned credentials. Never commit passwords or share a common privileged login.
- Organization creation and user provisioning must be explicitly scoped to this unique login code and performed using a guarded transaction.
- Refuse to operate if an existing organization has that code unless it carries an independently verified demo marker and matches the expected organization ID.
- Do not use platform customer-account creation as a substitute for tenant creation.

## Safety requirements
1. Start with read-only preflight: schema/migration compatibility, deployed commit, organization-code collision, file-storage and malware-scanner availability, role and permission catalog, and tenant-scoped write paths.
2. Add a `--dry-run` default. Require an explicit `--apply` and `--confirm-demo-tenant=trace-demo-lab` for any writes.
3. No global deletes, no updates to other tenants, no changes to existing user roles, no tenant-agnostic upserts, no reuse of production identities or PHI.
4. Tenant-scoped uniqueness, repeatable idempotency keys, transaction rollback on error, and detailed non-sensitive audit/provisioning output.
5. Create demo documents through governed document APIs/service operations. Never directly synthesize approvals, signatures, scan-clearance, or audit events.
6. File uploads must follow the private-storage malware-scan gate. If scanner/storage is unavailable, create text-backed draft content only and report attachments as blocked.
7. Use realistic document lifecycles only through authorized distinct demo actors; do not claim executed validation or accreditation.
8. Demo tenant must never be considered rc.9 validation evidence. All demo data must remain conspicuously labeled synthetic.
9. Do not create infrastructure or incur new AWS costs.
10. Before applying to the shared Railway database, require an explicit preflight review of the exact tenant ID, counts, and planned mutations.

## Demonstration content manifest
- Sites: Main Laboratory; Sample Receiving.
- Departments: Quality Assurance; Molecular Diagnostics; Accessioning; Laboratory Administration.
- Controlled document categories: SOP, Policy, Form, Work Instruction, Quality Plan.
- Initial document catalog (all synthetic):
  - DEMO-SOP-001 Specimen Receipt and Acceptance
  - DEMO-SOP-002 Molecular Extraction Workflow
  - DEMO-SOP-003 qPCR Amplification and QC Review
  - DEMO-SOP-004 Document Control and Revision
  - DEMO-SOP-005 Equipment Maintenance and Calibration
  - DEMO-SOP-006 Temperature Excursion Management
  - DEMO-SOP-007 Nonconforming Work and CAPA
  - DEMO-SOP-008 Personnel Training and Competency
  - DEMO-POL-001 Quality Policy
  - DEMO-POL-002 Data Access and Confidentiality
  - DEMO-WI-001 Barcode Label Verification
  - DEMO-WI-002 Daily Instrument Startup
  - DEMO-FRM-001 Specimen Rejection Log
  - DEMO-FRM-002 Temperature Log
  - DEMO-FRM-003 Corrective Action Record
- Target expansion: 25–35 documents; 6–8 fictional users; training, competency, quality and equipment records only where service APIs support governed creation.
- Seed documents as DRAFT first. Later showcase approved/effective/superseded workflows using actual application actions and authorized demo identities.

## Acceptance tests
- Demo login resolves only to the demo organization.
- Cross-tenant read/write requests fail closed in both directions.
- Re-running dry-run causes zero writes.
- Re-running apply neither duplicates records nor mutates unrelated tenants.
- Wrong organization code or unrecognized existing organization causes a hard failure.
- Document status changes require workflow permissions, authentication and proper audit/signature paths.
- No document attachment bypasses malware scanning.
- No demo provisioning job uses customer production credentials or secret values in logs.

## Execution gate
This file is the first planning artifact only. Do not run any production database seed or merge this change without implementing and testing the guarded provisioning code and reviewing Railway environment readiness.
