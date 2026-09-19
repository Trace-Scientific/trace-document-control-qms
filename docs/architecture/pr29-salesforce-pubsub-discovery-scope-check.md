# PR 29 Scope Check — Salesforce Pub/Sub Authentication and Discovery

## Included

- Strict parsing of Salesforce Pub/Sub RPC metadata.
- Explicit `tenantId`/org-ID requirement.
- Fixed global Pub/Sub endpoint allowlist.
- Injected `GetTopic` / `GetSchema` transport contract.
- Topic-name and subscribability checks.
- Schema-ID consistency checks.
- Bounded Avro-record schema JSON validation.
- Schema SHA-256 calculation for later cache/change detection.
- Tests for credentials, endpoint, discovery sequencing, fail-closed behavior, and no runtime composition.
- Architecture documentation.

## Explicitly excluded

- No gRPC package or live network transport.
- No Subscribe stream.
- No Avro payload decoding.
- No replay activation.
- No CDC event persistence.
- No runtime registration.
- No scheduler or Railway service.
- No database migration.
- No protected AWS provisioning.

## Acceptance guardrail

Merging this PR must not initiate Salesforce Pub/Sub network traffic. The implementation only establishes a typed, testable authentication/discovery contract for the later gRPC transport PR.
