# Post-rc.6 platform/commercial/help UAT extension

## Purpose

This protocol extends the controlled UAT baseline for material controls implemented after the frozen `0.1.0-rc.6` candidate.

It supplements:

- `UAT-01` through `UAT-15` in `critical-workflow-uat-protocol.md`; and
- `UAT-16` through `UAT-39` in `critical-workflow-uat-post-prompt-058.md`.

Execute only against an immutable release-candidate SHA in the approved validation environment using synthetic data.

## Preconditions

- Exact candidate SHA/package version are recorded.
- CI, Security, migrations, readiness, and validation-environment qualification passed for the same candidate.
- Synthetic platform identities/roles, customer accounts, subscriptions, sales representatives, support cases, Help content, and User Manual release data exist as applicable.
- `UM-QMS-001` remains unpublished unless the controlled test specifically exercises publication under an approved validation step.
- No production PHI/PII, credentials, tokens, secrets, or unrelated tenant content appears in evidence.

## Test cases

| ID | Requirement | Actor | Procedure | Expected result |
| --- | --- | --- | --- | --- |
| UAT-40 | UR-026 | Tenant user | Open Help from major workspaces and follow contextual guidance | Help is reachable; context resolves to published reviewed guidance; hidden/draft Help content is not exposed |
| UAT-41 | UR-026 | Authorized manual administrator | Review current controlled User Manual release, historical release, and generated PDF snapshot | Manual is searchable/release-versioned; prior release remains retrievable; snapshot is tied to the intended release/revision evidence |
| UAT-42 | UR-026 | Unauthorized/limited tenant user | Attempt to use Help/manual content to obtain a function not granted by tenant permissions | Guidance may be visible as permitted, but no tenant permission or governed action authority is added |
| UAT-43 | UR-027 | Platform security administrator | Review platform identities/roles and create/update an allowed custom-role assignment | Platform authority is managed only in platform security domain and remains separate from tenant roles |
| UAT-44 | UR-027 | Tenant administrator | Attempt to grant or obtain platform privileges through tenant Administration | Platform privilege is unavailable; tenant role/membership changes do not create PlatformIdentity/PlatformMembership grants |
| UAT-45 | UR-028 | Platform subscription administrator | Assign an active customer to an active plan version and enable/disable a module entitlement | Entitlement state changes as configured without creating tenant RBAC grants or deleting governed tenant history |
| UAT-46 | UR-028 | Tenant user | Access a disabled optional module that retains governed historical data | New disallowed operations fail closed while retained governed data follows configured read/retention/export behavior; historical records are not deleted |
| UAT-47 | UR-029 | Platform subscription administrator | Create a subscription with customer-specific contracted terms and inspect effective terms/reporting | Contracted terms are attributable and remain immutable; effective commercial reporting uses contract overrides where present |
| UAT-48 | UR-029 | Platform subscription administrator | Configure a draft plan version and attempt activation without then with explicit business approval evidence | Incomplete/unapproved activation is blocked; approved activation records attributable immutable business approval and freezes version terms |
| UAT-49 | UR-030 | Sales administrator | Assign/reassign customer sales ownership and inspect historical ownership | Current owner changes as authorized while prior effective-dated assignment history remains reproducible |
| UAT-50 | UR-030 | Sales administrator | Apply a versioned commission rule, record status/adjustment, and review reporting/audit | Calculation remains tied to the applicable rule version; adjustment requires reason; status/reporting/audit evidence is attributable |
| UAT-51 | UR-030 | Sales representative | Attempt to view another representative's unassigned commercial account and any tenant QMS content | Unassigned commercial account is not exposed; sales ownership grants no tenant QMS access |
| UAT-52 | UR-031 | Technical Support requester / approver | Create/open support case, request access, approve with a different authorized platform member, and assume session | Self-approval is blocked; approved requester alone can assume; banner shows target tenant; session has explicit expiry/capabilities |
| UAT-53 | UR-031 | Technical Support | Use an active session authorized for Tenant A against Tenant B or after expiry/revocation | Wrong-tenant, expired, revoked, or missing session fails closed with no tenant data disclosure or mutation |
| UAT-54 | UR-032 | Technical Support | Attempt electronic signature, document/workflow approval, legal-hold release, or tenant security administration through support context | Customer-only accountable action is denied even with active support session |
| UAT-55 | UR-032 | Technical Support / auditor | Perform an allowed support-safe action and review tenant/platform audit | Tenant and platform audit evidence correlate to support session/case and preserve Trace platform actor identity |
| UAT-56 | UR-033 | Platform auditor | Review Platform Audit for representative subscription, support, sales, pricing, and security events | Events are attributable and visible within platform authority without exposing unrelated regulated tenant record bodies |
| UAT-57 | UR-033 | Authorized platform operator | Review System Health and operational state | Health view is available to authorized platform users, reflects bounded operational signals, and does not grant tenant record access |

## Acceptance

All applicable cases pass for the exact release-candidate SHA, or failures are governed through deviation, impact assessment, corrective action, retest, residual-risk review, and required approval.

Passing these cases is evidence for the tested candidate only. It does not independently establish production approval, regulatory certification, or authorization to process regulated data.
