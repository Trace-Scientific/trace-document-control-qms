# Prompt 007 — Electronic Approval Signatures and Reauthentication

## Objective

Require a fresh authenticated signature before a controlled document can move from review to approved.

## Controls

- unsigned approval is unavailable through the generic lifecycle API
- signer must hold the current `document.approve` permission
- password reauthentication is verified server-side against the stored scrypt hash
- failures create append-only authentication/security evidence without storing the password
- approval, workflow completion, authentication event, signature, and audit event commit atomically
- the signature payload binds tenant, signer, document, exact version, revision label, content hash, meaning, and timestamp
- stale lock versions and content changes invalidate the attempt
- signature evidence remains immutable

## Exclusions

- handwritten signature images
- delegated or proxy signing
- production MFA/SSO provider selection
- acknowledgment signatures
- compliance-certification claims

## Definition of done

Adversarial tests cover wrong passwords, stale versions, cross-tenant access, missing permissions, unsigned approval, and payload tampering. Database migrations/integrity, dependency audit, typecheck, lint, tests, and production build pass in CI.
