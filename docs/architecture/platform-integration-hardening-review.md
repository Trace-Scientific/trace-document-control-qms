# Platform Integration Hardening & Completeness Review

Status: Post-PR-15 implementation review
Baseline: `main` at `789ee4198fc926f5cbe1cfb374129d4ee4576205`

## Completed foundation

The platform expansion sequence through PR 15 has established:

- independent platform identity/RBAC and append-only platform audit;
- customer, support-access, subscription/entitlement, sales/commission, help/manual, notification/reporting, and system-health control-plane domains;
- vendor-neutral platform integration connections, durable outbound delivery, retry/dead-letter/replay, inbound receipts, normalized events, and health monitoring;
- focused provider adapters for Stripe, QuickBooks, Salesforce, SendGrid, Twilio, and Zendesk.

The core tenant boundary remains unchanged: providers do not become tenant or platform authorization authorities, and provider events do not directly perform accountable-user QMS actions.

## Deferred production-readiness gaps

### 1. Provider-safe inbound verification boundary

The original generic route decoded request bodies to UTF-8 text before adapters received them. That is insufficient for providers that require the exact original bytes or canonical URL/form representation for signature validation.

PR 16 addresses this first by preserving exact bytes, canonical URL, bounded form parameters, and exact-byte hashing while retaining decoded text for existing JSON adapters.

### 2. Production secret-management resolver

The current provider resolver accepts only `env:TRACE_INTEGRATION_*` references. This is appropriate for synthetic development preview, but protected AWS deployment should resolve opaque references through governed AWS secret-management infrastructure with least-privilege IAM, rotation, caching/expiry rules, audit-safe error handling, and no secret values in application data.

Planned: PR 17.

### 3. OAuth/token lifecycle

QuickBooks and Salesforce currently consume already-resolved bearer/token bundles. Consent, refresh-token persistence, refresh/rotation, revocation, expiry handling, and provider-specific OAuth state/PKCE controls are intentionally not implemented.

Planned: PR 18 as a provider-neutral OAuth credential lifecycle plus focused provider enablement where applicable.

### 4. Delivery correlation / duplicate-send mitigation

The durable queue is at-least-once. Stripe uses its persisted platform idempotency key, but SendGrid/Twilio and other providers do not provide a universal exactly-once guarantee through the current adapter boundary. Provider response identifiers are not yet persisted as first-class delivery correlation metadata.

Planned: PR 19 to capture bounded provider delivery references and strengthen replay/duplicate-detection observability without claiming impossible exactly-once semantics.

### 5. Inbound provider enablement

After PR 16, provider-specific callback support can be added only where the provider verification model is fully represented. SendGrid event callbacks and Twilio delivery/inbound callbacks remain disabled until their adapters explicitly consume the hardened evidence and receive dedicated threat-model tests.

Planned: PR 20+ as focused provider callback PRs, not one broad activation change.

### 6. Salesforce CDC subscriber

Salesforce inbound synchronization remains intentionally excluded because it requires Pub/Sub/CDC subscriber lifecycle, replay state, schema/Avro handling, reconnect behavior, monitoring, and least-privilege channel permissions. It should not be approximated through the webhook route.

Planned only after the core hardening sequence above.

## Recommended next controlled sequence

1. **PR 16 — Provider-Safe Inbound Webhook Boundary**
2. **PR 17 — AWS Secret Resolver & Credential Reference Hardening**
3. **PR 18 — OAuth Credential Lifecycle Foundation**
4. **PR 19 — Provider Delivery Correlation & Duplicate-Risk Controls**
5. **PR 20+ — Provider-specific inbound callback enablement**
6. **Later — Salesforce CDC/Pub-Sub subscriber**

Each remains additive and independently reviewable. No item changes tenant QMS authorization, grants provider authority, or permits providers to perform customer electronic signatures/approvals.
