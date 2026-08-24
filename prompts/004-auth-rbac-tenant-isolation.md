# Prompt 004 — Authentication, RBAC, and Tenant Isolation

## Objective

Implement the server-side security boundary required before exposing QMS business APIs. Authentication, tenant authorization, resource scope, workflow eligibility, and privileged-action auditing must be explicit and deny by default.

## Required scope

1. Authentication and session records
   - secure credential-hash boundary or external identity-provider boundary
   - opaque, hashed session tokens
   - absolute and idle expiration
   - revocation and account-status enforcement
   - authentication-event evidence for login, reauthentication, MFA, failure, and logout
   - no plaintext passwords or session tokens in persistent storage or logs

2. Tenant context
   - derive organization access from authenticated membership
   - never trust an organization ID supplied by the browser without membership validation
   - require one explicit active organization per request
   - prevent cross-tenant identifiers from resolving through services or repositories

3. Authorization
   - deny-by-default permission evaluation
   - server-side role and permission enforcement
   - optional site and department scope
   - privileged operations require explicit permissions
   - workflow eligibility remains an additional authorization layer

4. Audit
   - login, logout, failed login, session revocation, role assignment, permission changes, tenant switching, and privileged access decisions produce appropriate audit/security events
   - never log credentials, raw session tokens, or unnecessary sensitive data

5. Electronic-signature readiness
   - authentication events can be bound to later signature records
   - reauthentication evidence includes method, time, user, tenant, and expiration
   - no signature is created in this prompt

## Required tests

- inactive and locked users cannot authenticate
- expired, idle, revoked, and malformed sessions are rejected
- raw tokens are not persisted
- users cannot select an organization without membership
- cross-tenant user, role, resource, site, and department identifiers are rejected
- missing permissions deny access
- explicit permissions allow only their configured scope
- role changes take effect without trusting stale client claims
- privileged authorization and session events are audited
- ordinary application paths cannot modify audit history

## Exclusions

- document-control business APIs
- user-interface polish
- production SSO provider integration
- final MFA provider selection
- electronic-signature execution
- compliance certification claims

## Definition of done

Database migrations deploy on PostgreSQL, security tests pass, dependency audit passes, typecheck/lint/unit tests/build pass, the diff contains no secrets, and a scoped pull request documents security assumptions and remaining production decisions.
