# PR 31 Scope Check — Salesforce Subscribe Protocol Foundation

## Included

- Encode initial Salesforce `FetchRequest` messages.
- Encode follow-up flow-control requests.
- Enforce LATEST/EARLIEST/CUSTOM replay semantics.
- Enforce opaque replay-ID validation.
- Enforce `num_requested` range 1–100.
- Decode bounded `FetchResponse` envelopes.
- Decode bounded `ConsumerEvent` envelopes without Avro interpretation.
- Preserve event and latest replay IDs as canonical base64.
- Distinguish event vs. keepalive checkpoint candidates.
- Surface `pending_num_requested` without autonomous refills.
- Tests for wire field numbers, replay rules, flow-control bounds, events, keepalives, malformed responses, and no runtime composition.

## Explicitly excluded

- No live `Subscribe` RPC.
- No HTTP/2 network code.
- No Avro decoding.
- No CRM field normalization.
- No database writes or normalized-event persistence.
- No replay checkpoint persistence.
- No scheduler or runtime registration.
- No Railway resource mutation.
- No protected AWS provisioning.

## Acceptance guardrail

Merging this PR must not create any process capable of opening a Salesforce subscription. It provides only deterministic protocol codecs and checkpoint classification for a later reviewed stream-controller slice.
