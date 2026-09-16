# OAuth Credential Lifecycle & Secure Token Management

Status: PR 18 integration hardening
Baseline: `main` at `831e21b7c9e55d49411efb6ecd45f2a6551510fb`

## Purpose

Add a provider-neutral lifecycle for OAuth-backed integration credentials without making OAuth providers authorization authorities and without storing access tokens, refresh tokens, client secrets, authorization codes, OAuth state values, or PKCE verifiers in application tables.

## Trust model

`PlatformIntegrationConnection.credentialRef` remains the only application-data pointer to provider credentials. Managed OAuth lifecycle requires an `aws-sm://trace-qms/validation/integrations/...` reference. Railway `env:` references remain read-only and cannot participate in managed token rotation.

The validation application task role may read and rotate only the governed integration-secret namespace. It receives `secretsmanager:GetSecretValue` and `secretsmanager:PutSecretValue` on that namespace plus KMS decrypt only through Secrets Manager. No long-lived AWS key is introduced.

## Persisted metadata

`PlatformOAuthCredentialLifecycle` stores only lifecycle metadata: provider key, status, granted scope names, expiry/scheduling timestamps, bounded failure codes, worker claim state, and optimistic lock version.

`PlatformOAuthAuthorizationSession` stores only a SHA-256 hash of OAuth `state`, the PKCE S256 challenge, expiration, and consumed timestamp. The plaintext state returned to the initiating administrator is not persisted. The PKCE verifier is temporarily stored only inside the governed AWS credential secret and is removed when the one-time session is consumed.

## Authorization-session boundary

Starting a session requires `platform.integration.manage`, an adapter/provider match, and an AWS credential reference. A new 256-bit state value and high-entropy PKCE verifier are generated per session. Prior unconsumed sessions for the same connection are invalidated. Sessions expire after ten minutes and are one-time consumable.

The provider-specific browser redirect and authorization-code exchange are intentionally not exposed as generic arbitrary-URL operations. Focused provider authorization endpoints may consume this foundation only after their redirect URI, authorization host, token endpoint, scope set, and PKCE behavior are separately reviewed.

Salesforce currently supports PKCE for authorization-code flows and recommends/enables enforcement. QuickBooks authorization-code initiation is not activated by this PR because equivalent current Intuit PKCE documentation was not established during this review.

## Refresh lifecycle

QuickBooks and Salesforce provider hooks may refresh only an existing governed secret bundle. Refresh work is claimed with `FOR UPDATE SKIP LOCKED`, bounded worker claims, stale-claim recovery, and explicit `REAUTH_REQUIRED` handling for provider invalid-grant/invalid-token failures.

QuickBooks token rotation preserves the newly returned refresh token and records provider-reported access/refresh expiry metadata. Salesforce preserves a rotated refresh token when returned and updates the allowed Salesforce instance origin; because Salesforce does not provide a universal access-token lifetime in this response path, no fabricated expiry is recorded.

## Revocation

Administrative revocation requires platform integration-management permission and a reason. The provider revocation call is attempted first; on success the governed secret bundle is rewritten without access/refresh token material and lifecycle metadata transitions to `REVOKED`. Revocation does not change tenant RBAC, platform RBAC, or QMS accountable-user authority.

## Explicit exclusions

- Production `aws-sm://trace-qms/production/...` support.
- Generic arbitrary OAuth provider configuration.
- A browser-facing consent/callback API in this PR.
- QuickBooks authorization-code initiation until its PKCE/redirect requirements are separately verified.
- Salesforce CDC/Pub-Sub ingestion.
- Provider delivery correlation, which remains PR 19 scope.
