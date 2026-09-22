# Post-rc.6 validation traceability extension

## Purpose

This matrix extends the existing validation baseline for material controls added after the frozen `0.1.0-rc.6` candidate.

It supplements:

- `docs/validation/traceability-matrix.md` — `UR-001` through `UR-013`; and
- `docs/validation/traceability-matrix-expanded.md` — `UR-014` through `UR-025`.

It does not duplicate those requirements.

“Automated pass required” means the cited tests must pass for the exact candidate SHA. It is not a claim of validation approval, certification, or production readiness.

| ID | User requirement | Functional/design control | Automated evidence | RC status |
| --- | --- | --- | --- | --- |
| UR-026 | Controlled Help and User Manual content must remain role-aware, release-versioned, historically retrievable, and unpublished until governed publication | Published-only Help boundary, reviewed Help baseline, role-aware recommendations, controlled manual revisions/releases, deterministic retained PDF snapshots | `contextual-help-deep-links.test.ts`, `role-aware-help-recommendations.test.ts`, `help-center-controlled-user-manual.test.ts`, `controlled-user-manual-pdf-snapshots.test.ts`, `help-launch-content-coverage.test.ts` | Automated pass required plus UAT |
| UR-027 | Platform identities, memberships, roles, and permissions must remain separate from tenant identities/RBAC and enforce least privilege | Independent platform security domain, deny-by-default platform authorization, bootstrap-controlled system roles, platform security administration | `platform-security-administration.test.ts`, `platform-administration-shell.test.ts`, `support-tenant-isolation-gate.test.ts` | Automated pass required plus security UAT |
| UR-028 | Commercial subscriptions and entitlements must remain separate from tenant RBAC and must not delete or rewrite governed tenant history when plan/module state changes | Versioned Plan/PlanVersion, Subscription, PlanFeature, EntitlementOverride, entitlement resolution outside tenant Role/Permission/UserRole | `product-plan-subscription-entitlements.test.ts`, `platform-subscriptions-workspace.test.ts`, `entitlement-override-administration.test.ts` | Automated pass required plus UAT |
| UR-029 | Customer-specific contracted/grandfathered commercial terms and public plan pricing approvals must remain attributable, versioned/immutable, and separate from regulated tenant records | Immutable subscription contract overrides, immutable business approval evidence on PlanVersion activation, configurable catalog pricing | `subscription-contracted-terms.test.ts`, `subscription-commercial-terms.test.ts`, `plan-pricing-business-approval.test.ts`, `commercial-pricing-analysis.test.ts` | Automated pass required plus UAT |
| UR-030 | Sales ownership and commission administration must preserve historical attribution, reproducible rules, audited adjustments/status, and must never grant tenant QMS access | Effective-dated SalesAssignment, versioned CommissionPlan/Rule, commission ledger/status, representative self-scope, commercial-only control plane | `sales-commission-foundation.test.ts`, `sales-ownership-workspace.test.ts`, `commission-administration-workspace.test.ts`, `sales-representative-scoping.test.ts` | Automated pass required plus UAT |
| UR-031 | Cross-tenant Technical Support access must require an approved, requester-bound, time-bounded controlled support session for the exact tenant and explicit capability | Two-person approval, requester-bound issuance, 5–240 minute expiry, exact target-organization gate, capability gate, support banner, revocation/exit | `controlled-support-access.test.ts`, `support-access-operations.test.ts`, `support-tenant-isolation-gate.test.ts` | Automated pass required plus security UAT |
| UR-032 | Controlled support access must prohibit customer-only accountable actions and preserve attributable tenant/platform audit evidence for allowed support-safe activity | Customer-only action deny list, support-safe-write capability, linked tenant/platform audit correlation, platform actor retained instead of tenant masquerade | `controlled-support-access.test.ts`, `support-tenant-isolation-gate.test.ts` | Automated pass required plus security UAT |
| UR-033 | Platform operational administration must provide attributable Platform Audit and System Health visibility without exposing or mutating regulated tenant content outside governed boundaries | Platform audit browser, platform health read model/workspace, commercial/support metadata separation | `platform-audit-browser.test.ts`, `platform-system-health.test.ts`, `platform-commercial-help-acceptance-evidence.test.ts` | Automated pass required plus UAT |

## Evidence requirements for the next release candidate

For each applicable requirement `UR-026` through `UR-033`, the controlled validation package must retain:

- exact candidate SHA and package version;
- successful CI and Security evidence for that SHA;
- applicable migration/integrity evidence;
- mapped automated-test evidence;
- executed UAT result with expected negative/fail-closed cases;
- deviation/correction/retest evidence for any failure;
- residual-risk owner and approval where required; and
- final controlled release decision.

## Scope boundary

These requirements are implementation traceability for post-rc.6 controls. They do not approve any AWS APPLY, publish the controlled User Manual/Help baseline, authorize regulated data processing, or establish regulatory certification.
