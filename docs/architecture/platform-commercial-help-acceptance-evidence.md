# Platform, Commercial, and Help Acceptance Evidence Matrix

Status: closure-readiness evidence for the remaining platform-expansion issues.

Baseline: `ca58920300f80daa5fa06e81abf29d4daec7fadc`

This matrix maps each open acceptance criterion to implemented controls and focused CI evidence. It is intentionally an evidence index rather than a new feature specification.

## Commercial packaging — subscription plans, entitlements, billing model, and pricing readiness

| Acceptance criterion | Implementation evidence | CI evidence |
| --- | --- | --- |
| Platform administrator can assign a customer to a plan and modules | Versioned Plan/PlanVersion catalog, Subscription assignment, PlanFeature and EntitlementOverride administration | `platform-subscriptions-workspace.test.ts`, `product-plan-subscription-entitlements.test.ts`, `entitlement-override-administration.test.ts` |
| Entitlements do not replace tenant RBAC | Entitlement resolution remains separate from tenant authorization and does not write tenant Role/Permission grants | `product-plan-subscription-entitlements.test.ts`, `support-tenant-isolation-gate.test.ts` |
| Plan/module changes do not delete governed historical data | Entitlements gate capability while governed records remain in tenant tables; overrides are additive/revocable | `product-plan-subscription-entitlements.test.ts`, `entitlement-override-administration.test.ts` |
| Pricing versions and grandfathered terms are supported | Immutable PlanVersion catalog plus immutable Subscription contract overrides | `subscription-commercial-terms.test.ts`, `subscription-contracted-terms.test.ts` |
| Monthly/annual cadence and included/additional users are representable | BillingCadence, includedFullUsers, additionalUserRateCents, storageAllowanceGb | `subscription-commercial-terms.test.ts` |
| Ready for later billing-provider integration | Provider-neutral platform integration framework and commercial identifiers remain outside tenant regulated identity | `platform-integration-framework.test.ts` |
| Public pricing remains configurable and business-approved | Draft pricing is configurable; activation requires attributable immutable business approval | `plan-pricing-business-approval.test.ts` |
| Pre-launch cost/margin/competitive analysis is available | Configurable cost assumptions, recurring margin analysis, dated/source-attributed competitor observations | `commercial-pricing-analysis.test.ts` |

## Help Center — contextual how-tos, electronic user manual, and support requests

| Acceptance criterion | Implementation evidence | CI evidence |
| --- | --- | --- |
| Help reachable throughout application | Persistent QMS shell Help entry and contextual entry points | `contextual-help-entrypoints.test.ts` |
| Major workflows have contextual how-to content | Reviewed workflow baseline and workspace-to-article deep links | `contextual-help-deep-links.test.ts`, `reviewed-help-baseline.test.ts` |
| Full user manual is searchable and release-versioned | Controlled User Manual authoring/release model and Help Center reader | `help-center-controlled-user-manual.test.ts`, `controlled-user-manual-complete-drafts.test.ts` |
| Prior manual versions remain retrievable | Historical manual release/revision model | `help-center-controlled-user-manual.test.ts` |
| Support requests include safe diagnostic context | Safe Help support intake excludes secrets/regulated content by default | `help-support-request-intake.test.ts`, `customer-support-request-history.test.ts` |
| Help respects role/permission context | Role-aware recommendations derive from existing tenant permissions without granting access | `role-aware-help-recommendations.test.ts` |
| Release-specific electronic/PDF manual can be produced | Retained controlled PDF snapshots by software/manual release | `controlled-user-manual-pdf-snapshots.test.ts` |
| Launch content families are covered | Getting started, workflows, FAQ, troubleshooting, glossary, administration, release notes | `help-launch-content-coverage.test.ts` |

## Commercial Administration — customer sales ownership and commission tracking

| Acceptance criterion | Implementation evidence | CI evidence |
| --- | --- | --- |
| Each customer can have an attributable sales owner | SalesRepresentative and effective-dated SalesAssignment | `sales-ownership-workspace.test.ts` |
| Historical sales assignments are preserved | Assignment history is effective-dated and retained | `sales-commission-foundation.test.ts`, `sales-ownership-workspace.test.ts` |
| Commission calculations remain reproducible when rules change | Versioned/effective-dated commission plan/rule model | `sales-commission-foundation.test.ts`, `commission-administration-workspace.test.ts` |
| Commission status is reportable and audited | Commission ledger/status workflow plus platform audit evidence | `commission-administration-workspace.test.ts`, `platform-notifications-reporting.test.ts` |
| Platform administrators can report customers and revenue by salesperson | Commercial reporting and sales ownership workspaces | `platform-notifications-reporting.test.ts`, `sales-ownership-workspace.test.ts` |
| Sales ownership does not grant tenant QMS access | Sales Representative self-scope is commercial-only and does not create tenant grants | `sales-representative-scoping.test.ts` |
| Commercial records remain separate from regulated tenant quality records | Commercial models reside in platform control-plane tables | `customer-commercial-profile.test.ts`, `sales-commission-foundation.test.ts` |

## Platform Administration — cross-tenant owner, support access, subscriptions, and platform audit

| Acceptance criterion | Implementation evidence | CI evidence |
| --- | --- | --- |
| Platform Owner can manage subscribed organizations without ordinary tenant identity | Independent PlatformIdentity/PlatformMembership/RBAC plus customer organization administration | `platform-administration-shell.test.ts`, `customer-account-foundation.test.ts`, `platform-security-administration.test.ts` |
| Technical Support cannot access tenant content without authorized support context | Separate support authentication, active requester-bound session, exact-target tenant and explicit capability | `controlled-support-access.test.ts`, `support-tenant-isolation-gate.test.ts` |
| Support sessions are time-bounded and fully audited | 5–240 minute sessions, expiry/revoke/exit, append-only session/approval evidence, dual audit correlation | `controlled-support-access.test.ts`, `support-access-operations.test.ts` |
| Platform role permissions enforce least privilege | Deny-by-default platform authorization and custom-role administration; system roles bootstrap-controlled | `platform-security-administration.test.ts` |
| Tenant administrators cannot grant platform privileges | Platform security domain is independent from tenant Role/Permission/UserRole | `platform-security-administration.test.ts`, `support-tenant-isolation-gate.test.ts` |
| Subscription/module entitlements do not rewrite historical governed tenant records | Separate Subscription/PlanFeature/EntitlementOverride control-plane model | `product-plan-subscription-entitlements.test.ts`, `entitlement-override-administration.test.ts` |
| CI/Security demonstrates tenant isolation and platform boundaries | Exact-target controlled-support gate and ordinary tenant authorization with no platform/support bypass | `support-tenant-isolation-gate.test.ts`, `controlled-support-access.test.ts` |

## Platform Administration workspace completeness

The launch workspaces are represented by focused evidence for:

- Dashboard / operational reporting — `platform-notifications-reporting.test.ts`
- Organizations — `customer-account-foundation.test.ts`
- Subscriptions / entitlements — `platform-subscriptions-workspace.test.ts`
- Sales & commissions — `sales-ownership-workspace.test.ts`, `commission-administration-workspace.test.ts`
- Support access / cases — `support-access-operations.test.ts`
- Platform users & roles — `platform-security-administration.test.ts`
- Platform audit — `platform-audit-browser.test.ts`
- System health — `platform-system-health.test.ts`

## Closure rule

These issue families are implementation-complete only when:

1. all focused CI/Security checks pass on the controlled `main` lineage;
2. no unresolved review thread identifies an unmet acceptance criterion;
3. no acceptance criterion above is contradicted by later code;
4. AWS remains PLAN-only until the separately governed validation-foundation APPLY decision; and
5. any public pricing values remain subject to explicit business approval rather than source-code constants.

If a later change invalidates one of these mappings, the corresponding issue should be reopened or a new corrective issue should be created rather than treating this matrix as permanent evidence.
