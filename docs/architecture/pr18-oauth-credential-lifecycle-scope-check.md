# PR 18 — OAuth Credential Lifecycle & Secure Token Management

Baseline: `main` at `831e21b7c9e55d49411efb6ecd45f2a6551510fb`

## Included

- Provider-neutral OAuth lifecycle metadata and worker claim states.
- AWS-only mutable OAuth credential storage through governed `aws-sm://` integration references.
- Secrets Manager `PutSecretValue` support with least-privilege validation IAM permission.
- QuickBooks refresh/revocation hooks with rotated refresh-token handling.
- Salesforce refresh/revocation hooks with approved Salesforce-origin validation.
- One-time OAuth authorization sessions with hashed state, S256 PKCE challenge, ten-minute expiry, and one-time consumption.
- Plaintext PKCE verifier retained only in the governed AWS secret during the pending authorization session.
- Explicit runtime registration of reviewed QuickBooks and Salesforce OAuth providers.
- Regression coverage and architecture evidence.

## Security invariants

- No access token, refresh token, client secret, authorization code, plaintext OAuth state, or PKCE verifier column exists in Postgres.
- `env:` credentials remain read-only and cannot be rotated by the OAuth lifecycle.
- OAuth providers never grant Trace platform roles, tenant roles, QMS approval authority, or subscription entitlements.
- Provider error bodies are not surfaced into database failure details or platform audit metadata.
- Invalid-grant / invalid-token failures transition lifecycle state toward reauthorization rather than retrying indefinitely.
- Revocation scrubs bearer/refresh token material from the governed secret bundle after provider revocation succeeds.

## Explicit exclusions

- Browser-facing OAuth consent/callback routes.
- Generic arbitrary OAuth authorization/token endpoints.
- QuickBooks authorization-code initiation until provider PKCE behavior is separately verified.
- Production AWS secret namespace or production IAM deployment.
- Provider delivery correlation / duplicate-risk controls (PR 19).
- New inbound provider callback enablement (PR 20+).

## Review boundary

This PR establishes secure lifecycle primitives and reviewed provider refresh/revocation hooks. Provider-specific consent redirect/callback APIs must be separate focused changes so redirect URIs, scopes, PKCE behavior, token endpoints, and callback threat models are reviewable per provider.
