# PR 30 Scope Check — Salesforce Unary gRPC Discovery Transport

## Included

- Secure HTTP/2 gRPC transport for `GetTopic` and `GetSchema` only.
- Hard-coded Salesforce Pub/Sub authority and RPC paths.
- Required Salesforce RPC metadata injection.
- 10-second bounded RPC deadline.
- 2.5 MB bounded response size.
- Narrow protobuf request encoding and response decoding for reviewed discovery messages.
- gRPC frame and status validation.
- Tests for wire compatibility, framing failures, metadata/transport guardrails, and no runtime composition.
- Architecture documentation.

## Explicitly excluded

- No `Subscribe`, `ManagedSubscribe`, `Publish`, or `PublishStream`.
- No Avro event decoding.
- No replay activation.
- No CDC event persistence.
- No runtime registration.
- No scheduler or Railway service.
- No database migration.
- No new third-party runtime dependency.
- No protected AWS provisioning.

## Acceptance guardrail

The merged code may contain a real Salesforce discovery transport but must remain unreachable from normal runtime composition and must expose only the two reviewed unary discovery RPCs.
