# Trace QMS MFA implementation contract (design only)

**Status:** Proposed; not implemented or enabled. No live database or Railway changes authorized.

## Current behavior and risk

The existing password login endpoint issues a session immediately for valid password-only accounts. A fail-closed guard now rejects `User.mfaEnabled=true` with a generic sign-in failure, and records `mfa_required`. This guard prevents password-only bypass but **locks MFA-enabled accounts out** until a complete challenge path is delivered. Do not set `mfaEnabled=true` for customer-demo users until the replacement flow is verified.

The current schema has `User.mfaEnabled`, `AuthenticationEventType.MFA_CHALLENGE`, and `AuthenticationMethod.MFA`, but no verified enrolled authenticator or single-use pending challenge state. A boolean flag is not proof of completed MFA.

## Required security contract

1. Choose supported factors: prefer passkeys/WebAuthn with origin, RP ID, challenge binding and signature-counter checks; if TOTP is offered, use a reviewed RFC 6238 implementation and encrypted per-user secrets. Never store plaintext secrets, backup codes or tokens in audit logs.
2. Enrollment requires an existing authenticated session, password reauthentication, server-issued enrollment challenge, factor proof, and an auditable activation transaction. MFA is enabled **only after proof succeeds**.
3. After password validation for an MFA-enabled user, issue only a short-lived, single-use, server-stored pending challenge bound to the organization, user, factor, client context and expiration. Do not create a QMS session or a successful LOGIN event yet.
4. The second-factor endpoint verifies the pending challenge and factor proof, enforces attempt limits, replay protection and atomic consumption, then creates the authenticated session and attributable success event in one transaction. Generic errors must not reveal account existence or factor status.
5. Recovery requires separately verified identity, audited one-time recovery credentials, rate limits and notification. Factor reset must revoke active sessions and pending challenges.
6. Server-side authorization must never accept a pending challenge as an authenticated session. Reauthentication for electronic signatures remains a separate explicit requirement.
7. Enforce tenant isolation for enrollment, challenge, verification, recovery and session issuance. Restrict challenge/factor database access; do not permit PUBLIC function access.
8. Account for clock drift only within a documented narrow window for TOTP, reject previously accepted time steps, and rate-limit guesses across concurrent requests.
9. Protect against CSRF and session fixation; rotate session credentials after completed MFA. Never send a QMS session cookie during password-only phase for MFA-enabled accounts.

## Proposed development order (review before implementing schema changes)

- Specify factors, recovery policy, threat model, and user experience.
- Add additive Prisma schema and migration for encrypted factor records, hashed pending challenge tokens, expiry, attempts, consumption and recovery credentials; use explicit organization-scoped foreign keys and indexes.
- Implement isolated factor verification with unit tests, then transactional challenge issuance and consumption with disposable PostgreSQL integration tests.
- Implement enrollment/verification/recovery API endpoints and browser screens; use generic login responses.
- Test cross-tenant denial, wrong password, missing factor, expired/used challenge, concurrent replay, brute-force throttling, recovery and logout/session revocation.
- Complete independent security review and successful CI. Deploy only with separately authorized change control and tested rollback.

## Customer-demo release gate

Do not advertise MFA as available or activate MFA-enabled demo accounts until enrollment, challenge, recovery, login, and browser-based tests pass and written security review is complete. PR #421 remains review-only; this document does not authorize merging, provisioning or deployment.
