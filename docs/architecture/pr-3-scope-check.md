# PR 3 Scope Check — Controlled Support Access

Baseline: `main` at `95aeb48c15e913e9512c008faea9c14107d22f1c`

## Included

- additive support case/request/approval/session schema;
- stable support capability catalog;
- append-only support approval and session event history;
- platform-authorized support case and access request APIs;
- two-person request approval separation;
- requester-bound, expiring, revocable support sessions;
- opaque HTTP-only support-session cookie with stored token hash only;
- separate support-aware request context;
- explicit customer-only action deny list;
- dual tenant/platform audit correlation helper for support-safe mutations;
- controlled support access banner and dedicated support context surface;
- security/regression tests and architecture documentation.

## Explicitly unchanged

- tenant `AuthorizationContext` and `requireAuthorization()`;
- tenant authentication/session semantics;
- tenant Role/Permission/UserRole models;
- customer electronic signature rules;
- legal hold authority;
- tenant security administration;
- subscription/entitlement behavior;
- sales/commission behavior;
- external provider integrations.

## Review rule

Do not merge if CI identifies a failure or if review finds any path that converts platform/support authority into ordinary tenant authority. The support context must remain explicit, time-bound, target-tenant-bound, actor-attributable, and capability-limited.
