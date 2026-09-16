# Platform Expansion Implementation Plan

Status: Approved architecture baseline; implementation planning
Baseline source: `main` at `9e8caed640bb49b52f4a15da50f575c2be7f2b24` (`0.1.0-rc.5` designation)
Scope: Post-rc.5 commercial platform/control-plane expansion

## 1. Purpose

This plan translates the approved platform-expansion architecture decisions A-M into an implementation sequence for Trace QMS. The work adds a Trace Scientific commercial/control plane without weakening the existing tenant isolation, regulated QMS authorization, audit, signature, retention, or deployment boundaries.

The governing rule is:

> No platform feature may weaken the rule that an ordinary tenant QMS request operates in exactly one authenticated organization context. Cross-tenant activity must occur only through a separately authorized, time-bound, attributable support-access mechanism.

This work is a new post-`0.1.0-rc.5` development stream. The `0.1.0-rc.5` source and validation-candidate evidence remain historical and are not rewritten by this plan.

## 2. Locked architecture decisions

The following approved decisions are implementation constraints:

- A. Logical Control Plane/Data Plane separation in the existing application and repository.
- B. Independent platform identity and platform membership/RBAC domain.
- C. Capability-based platform permissions; no global tenant authorization bypass.
- D. Case-bound, temporary, attributable support access; no permanent impersonation.
- E. Existing `Organization` remains the QMS tenant identity; commercial `CustomerAccount` is separate.
- F. Versioned plans/subscriptions and internally resolved entitlements remain separate from tenant RBAC.
- G. Versioned, auditable sales and commission subsystem.
- H. Separate append-only platform audit plus cross-linked support-session audit.
- I. Searchable Help Center plus separately controlled/versioned User Manual.
- J. Platform-scoped notifications and commercial/operational reporting.
- K. Sanitized read-oriented platform health dashboard.
- L. Vendor-neutral integration adapters, outbox, webhook verification, idempotency, and audit correlation.
- M. Incremental focused PRs with migration, security, CI, review, and post-merge verification.

## 3. Non-negotiable security boundaries

1. Tenant `AuthorizationContext` remains organization-bound.
2. No `isSuperAdmin`, `bypassAuthorization`, wildcard organization, or equivalent cross-tenant switch is added to tenant authorization.
3. Platform authorization uses a separate `PlatformAuthorizationContext`.
4. Platform roles do not implicitly grant tenant QMS permissions.
5. Tenant roles do not implicitly grant platform permissions.
6. Support access is explicit, short-lived, capability-limited, reason-bound, and attributable to the actual Trace platform actor.
7. Customer electronic signatures and other accountable-user actions cannot be performed as if the support actor were the tenant user.
8. Platform and tenant audit trails are append-only at the database boundary where applicable.
9. Railway remains a synthetic-data development preview. Protected validation/production remains on the governed AWS path.
10. External providers never become the runtime authorization authority for tenant or platform access.

## 4. Status vocabulary

New control-plane status vocabularies must be explicit and consistent across Prisma, TypeScript, API responses, and tests. The platform foundation must not reproduce the existing mismatch between database `UserStatus` and authorization-context state terminology.

Recommended initial platform identity status:

- `ACTIVE`
- `INACTIVE`
- `LOCKED`
- `PENDING`

Recommended customer account status:

- `PROSPECT`
- `ONBOARDING`
- `ACTIVE`
- `SUSPENDED`
- `TERMINATED`

Recommended support request/session status values will be introduced in the support-access PR with explicit transition rules.

## 5. Implementation sequence

### PR 1 - Platform Security & Data Foundation

Objective: Establish the control-plane data/security boundary without exposing cross-tenant business functions.

Scope:

- Add platform identity/membership/RBAC schema.
- Add `PlatformPermission`, `PlatformRole`, `PlatformRolePermission`, `PlatformMembership`, and membership-role assignment models.
- Add an explicit platform identity relationship that does not reuse tenant role assignments as platform authority.
- Add `PlatformAuditEvent` with database-enforced append-only protection.
- Add `PlatformAuthorizationContext`, platform authorization helpers, and deny-by-default permission evaluation.
- Define initial platform permission keys.
- Add platform request-authentication/context construction without changing the existing tenant `authenticateRequest()` authorization semantics.
- Add unit/security tests proving tenant users cannot obtain platform authority and platform roles cannot bypass tenant organization checks.
- Add migration-integrity tests for append-only platform audit protection.
- Add architecture documentation for the new security boundary.

Explicitly excluded:

- Customer account CRUD UI.
- Subscription/entitlement behavior.
- Support tenant access.
- Sales/commission UI.
- Help Center.
- External provider integrations.

Acceptance criteria:

- Existing tenant authorization tests remain unchanged and passing.
- Platform requests fail closed without an active platform membership and required permission.
- No platform permission grants direct tenant QMS authorization.
- Platform audit rows cannot be updated or deleted through normal database mutation.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:validate`, and `npm run build` pass.
- Migration review confirms no destructive change to existing tenant tables.

### PR 2 - Customer Account Foundation

Objective: Add the commercial customer layer while retaining `Organization` as the regulated tenant identity.

Scope:

- Add `CustomerAccount` linked to one QMS `Organization` where applicable.
- Add commercial lifecycle status and metadata.
- Add platform services for create/read/update/status transitions.
- Add immutable/audited status transition history where needed.
- Add least-privilege platform permissions and tests.
- Add platform-admin read/create/edit customer APIs.

Guardrails:

- No routine hard-delete of a customer organization.
- Customer termination does not erase governed tenant records.
- Customer status changes are audited.

### PR 3 - Controlled Support Access

Objective: Provide Trace support access without permanent impersonation or tenant authorization bypass.

Scope:

- Add `SupportCase`, `SupportAccessRequest`, `SupportAccessApproval`, `SupportSession`, capability records, and support-session event history.
- Enforce target organization, case/reason, approval rules, issuance, expiration, revocation, and permitted capabilities.
- Add assume/exit tenant-context flow.
- Display a persistent support-access banner containing the target organization identity.
- Preserve Trace platform actor identity in support-session audit.
- Cross-link tenant mutations to the support session/correlation identifier.
- Default-deny accountable tenant actions such as customer e-signatures, approval signatures, legal-hold release, security-role administration, and other actions specifically designated as customer-only.
- Add expiration/revocation tests and cross-tenant negative tests.

### PR 4 - Product, Plan, Subscription & Entitlement Foundation

Objective: Separate what a customer purchased from what an individual user may do.

Scope:

- Add `Product`, `Feature`, `Plan`, `PlanVersion`, `PlanFeature`, `Subscription`, `SubscriptionItem`, `Entitlement`, `EntitlementOverride`, and subscription-change history as justified by implementation detail.
- Add entitlement-resolution service.
- Add tests for active/inactive/suspended subscription states and overrides.
- Preserve RBAC as a separate authorization layer.

Access rule:

`tenant active` AND `feature entitled` AND `user authorized`

### PR 5 - Platform Administration Shell

Objective: Introduce a separate control-plane UI rather than adding platform controls to the QMS module shell.

Initial navigation:

- Overview
- Customers
- Subscriptions & entitlements
- Support access
- Sales
- Commissions
- Help content
- Platform audit
- System health
- Integrations

The shell must enforce server-authoritative platform permissions and avoid rendering tenant QMS navigation as the platform control surface.

### PR 6 - Sales & Commission Foundation

Objective: Add commercial attribution and governed commission calculations.

Scope:

- Add sales representative/assignment entities.
- Add versioned commission plans/rules.
- Add accrual, adjustment, approval, and payment records.
- Preserve the applied rule/version on historical commission calculations.
- Use compensating adjustment/reversal records instead of rewriting historical paid/approved transactions.

Recommended lifecycle:

`PENDING -> EARNED -> APPROVED -> PAID`

### PR 7 - Help Center & Controlled User Manual

Objective: Add operational assistance while preserving a separately controlled product manual.

Scope:

- Help article/category/revision model and search/read surfaces.
- Draft/publish/archive workflow for help content.
- Manual/release/section/revision model.
- Manual version, effective date, release applicability, revision history, and historical archive.
- Contextual help links from QMS workspaces where appropriate.

### PR 8 - Platform Notifications & Reporting

Objective: Reuse proven queue/delivery patterns without requiring a fake tenant organization.

Scope:

- Platform notification outbox/inbox or equivalent platform-scoped delivery model.
- Retry/backoff, dead-letter, delivery monitoring, and requeue controls.
- Platform operational/commercial reports for customers, subscriptions, entitlements, support activity, sales attribution, and commission status.
- No unrestricted cross-tenant regulated-content reporting engine.

### PR 9 - Platform System Health

Objective: Provide sanitized operational visibility.

Scope:

- Application readiness.
- Database connectivity.
- migration/release identity.
- Background jobs.
- Notification delivery health.
- Scheduled-task status.
- Integration status.
- Environment classification.

Secrets, tokens, connection strings, raw environment variables, and sensitive infrastructure configuration must not be exposed.

### PR 10 - Integration Framework

Objective: Establish vendor-neutral outbound/inbound integration boundaries before provider-specific integrations.

Scope:

- Integration connection metadata.
- Outbound integration event/outbox.
- Provider adapters.
- Inbound webhook receipt, signature verification contract, idempotency, normalized events, retry/dead-letter behavior, and audit correlation.
- Least-privilege provider credentials outside application data where practical.

### PR 11+ - Provider Integrations

Provider-specific work begins only after the internal domain model is stable. Candidate integrations may include billing/subscription, accounting, CRM, email/SMS, and support systems. Each provider is implemented as a separate focused change with provider-specific threat modeling and tests.

## 6. PR 1 proposed schema boundary

The exact final names may be refined during implementation, but PR 1 should remain limited to the following conceptual ownership graph:

- `PlatformIdentity`
  - represents the Trace-side human/service identity used by the control plane.
- `PlatformMembership`
  - grants that identity access to the Trace QMS platform administration domain.
- `PlatformRole`
  - named permission bundle for platform functions.
- `PlatformPermission`
  - stable permission key.
- `PlatformMembershipRole`
  - membership-to-role assignment.
- `PlatformRolePermission`
  - role-to-permission assignment.
- `PlatformAuditEvent`
  - append-only platform event history.

PR 1 must not create a relationship that lets a `PlatformRole` satisfy tenant `RolePermission` checks.

## 7. Initial platform permission catalog

PR 1 should seed or otherwise establish stable keys for at least:

- `platform.organization.read`
- `platform.organization.manage`
- `platform.organization.suspend`
- `platform.subscription.read`
- `platform.subscription.manage`
- `platform.entitlement.manage`
- `platform.support.request`
- `platform.support.approve`
- `platform.support.access`
- `platform.sales.read`
- `platform.sales.manage`
- `platform.commission.read`
- `platform.commission.manage`
- `platform.audit.read`
- `platform.help.manage`
- `platform.health.read`
- `platform.integration.manage`
- `platform.security.manage`

Permission descriptions must be human-readable in the administration UI and tests should use permission keys rather than role-name assumptions.

## 8. Initial platform roles

Roles are convenience bundles, not security primitives. Initial roles may include:

- Platform Administrator
- Security Administrator
- Support Administrator
- Support Agent
- Commercial Administrator
- Sales Administrator
- Help Content Administrator
- Platform Auditor
- Operations Viewer

The precise permission bundle is a controlled configuration decision and can be refined without changing the core authorization model.

## 9. Platform audit requirements

`PlatformAuditEvent` should include, at minimum:

- event ID
- platform actor identity/membership where applicable
- occurrence timestamp
- action
- entity type
- entity ID where applicable
- entity version where applicable
- request ID
- correlation ID
- reason where required
- previous/new hashes where useful
- structured metadata

Database migration must enforce append-only behavior against update and delete, mirroring the tenant audit protection pattern.

Support access will later extend this with support-session and target-organization correlation.

## 10. Testing strategy

Every platform PR must include positive and negative authorization coverage.

PR 1 minimum regression matrix:

1. Active tenant user with tenant administrator role cannot call a platform-authorized service without platform membership.
2. Active platform membership with no required platform permission is denied.
3. Inactive/locked platform identity or membership is denied.
4. Platform role assignment grants only the configured platform permission set.
5. Platform authorization helpers do not accept tenant `AuthorizationContext` as a substitute.
6. Existing tenant request authentication still returns organization-bound tenant authorization context.
7. Platform role/membership records cannot create wildcard tenant access.
8. Platform audit insert succeeds.
9. Platform audit update fails.
10. Platform audit delete fails.
11. Existing tenant authorization, signature, audit, session, and administration regression suites continue to pass.

## 11. Migration strategy

- Use additive Prisma migrations.
- Do not modify historical migration files.
- Do not reset the preview database.
- Review generated SQL before merge.
- Add database trigger/function migration statements explicitly where Prisma schema alone cannot express append-only behavior.
- Apply migrations in Railway through the existing preview image startup contract.
- Treat protected AWS migration/deployment evidence separately under the existing validation/release process.

## 12. Deployment and validation boundary

Railway remains a Trace-owned development preview for synthetic data only.

- No PHI, PII, customer regulated records, or production credentials.
- Preview platform users/customer accounts are synthetic.
- Preview support-access sessions have no regulated effect.
- Railway database data is not promoted or copied into protected validation or production.
- Changes continue through feature branch, CI, pull request, review, squash merge, and merged-main verification.
- Formal qualification/production release follows the protected AWS process and must use immutable source/image evidence appropriate to the new post-rc.5 release candidate when one is designated.

## 13. Definition of done for each implementation PR

A PR is not complete merely because the UI works. Applicable completion evidence includes:

- schema/migration review
- authorization and security regression tests
- unit/service tests
- lint
- TypeScript typecheck
- Prisma validation
- application test suite
- production build
- applicable deployment-control tests
- review of audit behavior
- documentation update
- successful GitHub checks
- squash merge to `main`
- post-merge verification before starting dependent work

## 14. Dependency graph

`PR 1 Platform Security & Data Foundation`

-> `PR 2 Customer Account Foundation`

-> `PR 3 Controlled Support Access`

-> `PR 4 Product/Plan/Subscription/Entitlement Foundation`

-> `PR 5 Platform Administration Shell`

After PR 5, the following may proceed as controlled dependent streams while preserving focused PRs:

- `PR 6 Sales & Commissions`
- `PR 7 Help Center & User Manual`
- `PR 8 Platform Notifications & Reporting`
- `PR 9 Platform System Health`

`PR 10 Integration Framework` should follow stable customer/subscription/platform security foundations.

Provider-specific `PR 11+` work follows the integration framework.

## 15. Immediate next implementation step

After this plan is merged, create a fresh branch from the resulting `main` and implement **PR 1 - Platform Security & Data Foundation** only.

Do not combine Customer Accounts, support access, subscriptions, sales, or UI expansion into PR 1. Keeping the first change security/data-foundation-only makes the new trust boundary reviewable and gives later commercial modules a stable platform authorization base.
