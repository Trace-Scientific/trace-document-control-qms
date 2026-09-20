# PR 38 Scope Check — Salesforce CDC Live Pipeline Composition Without Activation

## Included

- Compose receipt persistence -> schema resolution -> Avro interpretation -> semantic normalization -> normalized persistence inside the subscriber controller.
- Resolve each event's exact schema ID through reviewed GetSchema transport.
- Cache matching schemas only within one FetchResponse.
- Advance EVENT replay only after all events complete the full durable processing chain.
- Preserve direct KEEPALIVE checkpoint behavior.
- Add bounded degradation codes for each pipeline stage.
- Add tests for exact stage ordering, schema reuse, fail-closed behavior, and no runtime activation.
- Add event-schema resolver tests.
- Add architecture documentation.

## Explicitly excluded

- No integration-runtime registration.
- No scheduler/worker activation.
- No autonomous requestMore flow control.
- No automatic reconnect/backoff.
- No record-body persistence.
- No provider-to-QMS mapping.
- No downstream QMS mutation.
- No Railway resource mutation.
- No protected AWS provisioning.

## Acceptance guardrail

For a non-empty FetchResponse, the EVENT replay cursor must remain unchanged unless every event in that response has successfully completed immutable receipt persistence, exact-schema resolution, evidence-bound Avro interpretation, semantic normalization, and immutable normalized-event persistence.
