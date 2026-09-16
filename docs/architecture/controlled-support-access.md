# Controlled Support Access

Status: PR 3 implementation architecture
Baseline: post-PR #242 customer account foundation

## Purpose

Controlled Support Access gives Trace Scientific personnel a governed way to troubleshoot a specific customer tenant without creating a permanent cross-tenant administrator, impersonating a customer user, or weakening the ordinary tenant `AuthorizationContext`.

## Governing invariants

1. Ordinary tenant authentication and authorization remain unchanged and organization-bound.
2. A Trace platform role never becomes a tenant role.
3. A tenant role never grants platform support authority.
4. Support access requires an open support case tied to one customer account and one tenant organization.
5. Support access requires an explicit request with reason, duration, and capabilities.
6. The requester cannot approve their own request.
7. Only the approved requester may issue the support session.
8. Support sessions are short-lived (5 to 240 minutes), revocable, actor-bound, and tokenized with only a token hash persisted.
9. Ordinary tenant routes do not automatically accept support authority. A tenant operation must explicitly use the support-aware context and an approved support capability.
10. Customer-accountable actions remain prohibited through support access.

## Data model

The additive control-plane migration introduces:

- `SupportCase`
- `SupportCapability`
- `SupportAccessRequest`
- `SupportAccessRequestCapability`
- `SupportAccessApproval`
- `SupportSession`
- `SupportSessionCapability`
- `SupportSessionEvent`

`SupportAccessApproval` and `SupportSessionEvent` are append-only at the database boundary.

## Initial support capabilities

- `support.tenant.read`
- `support.tenant.troubleshoot`
- `support.tenant.safe_write`

These are support capabilities, not tenant QMS permissions. Adding a capability does not change `Role`, `Permission`, `UserRole`, or tenant `Session` behavior.

## Request and approval lifecycle

1. A platform member with `platform.support.request` opens a support case for a linked customer tenant.
2. The requester submits a support access request with a reason, requested duration, and explicit capabilities.
3. A different platform member with `platform.support.approve` approves or denies the request.
4. If approved, the original requester must also possess `platform.support.access` to issue the session.
5. Session issuance creates a cryptographically random opaque token. Only its SHA-256 hash is stored.
6. The browser receives the raw token only in an HTTP-only, strict same-site cookie.
7. The session is actor-bound, tenant-bound, capability-bound, expiring, and revocable.
8. Exit, revocation, or expiration makes the session unusable.

## Support-aware tenant context

`authenticateSupportTenantRequest()` is separate from ordinary `authenticateRequest()`.

The support context includes:

- support session ID
- support case ID
- actual Trace platform identity and membership
- target organization ID and display name
- expiration
- approved support capabilities

The support context is never converted into a normal tenant `AuthorizationContext`, and the Trace actor is never represented as a tenant employee.

## Customer-only actions

The initial explicit deny list includes:

- electronic signature creation
- document approval
- workflow approval
- legal-hold release
- tenant role administration
- tenant membership/security administration

The architectural rule is broader than the initial string list: any operation that requires customer accountability, attestation, signature intent, or tenant security authority must remain customer-only unless separately designed and validated in a future controlled change.

## Dual audit correlation

A support-safe tenant mutation must use `writeSupportLinkedTenantAudit()`.

The tenant audit event:

- is written under the target organization;
- leaves `actorUserId` null rather than inventing a tenant user;
- uses the support session UUID as the correlation ID;
- records the platform identity, platform membership, support case, and support session in metadata.

A corresponding `PlatformAuditEvent` is written with the actual Trace actor and the same support session correlation identifier.

This gives both tenant-side and platform-side traceability without impersonation.

## UI signal

A controlled support session surface displays a persistent `CONTROLLED SUPPORT ACCESS` banner with:

- target tenant display name;
- support case and session identifiers;
- expiration;
- approved capabilities;
- explicit notice that Trace support remains the recorded actor and customer-only approvals/signatures are prohibited.

The broader Platform Administration shell is intentionally deferred to PR 5.

## Explicit exclusions

This PR does not:

- add a global super-administrator;
- modify ordinary tenant authorization semantics;
- create a shadow tenant user for Trace support;
- allow customer electronic signatures or approvals;
- add subscriptions or entitlements;
- add sales or commissions;
- add provider integrations;
- grant unrestricted cross-tenant QMS access.

Support-aware tenant operations must opt in explicitly and remain capability-limited.
