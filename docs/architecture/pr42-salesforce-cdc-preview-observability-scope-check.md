# PR 42 Scope Check — Salesforce CDC Preview Observability

## Included

- Add sanitized Salesforce CDC telemetry to the existing permission-controlled System health workspace.
- Report subscription state counts, stale claims, 24-hour receipt/normalized-event counts, and latest event/checkpoint timestamps.
- Add authenticated read-only GET preflight to the existing internal worker route.
- Derive an activation-readiness signal without starting or claiming work.
- Add safe worker configuration inspection.
- Add secure one-shot preflight CLI command.
- Package the preflight command in the preview image.
- Add focused observability and non-activation tests.
- Update legacy System health tests for the current integration implementation.
- Add architecture documentation.

## Explicitly excluded

- No Railway service creation.
- No Railway variable changes.
- No worker enablement.
- No cron schedule.
- No worker execution from GET preflight.
- No reconnect/backoff.
- No record-body mapping.
- No QMS mutation.
- No AWS changes.

## Acceptance guardrail

The new observability surfaces must provide enough operational evidence to decide whether one bounded manual preview run is safe, while exposing no provider credentials, raw events, replay IDs, topics, Salesforce record identifiers, or regulated content and performing no CDC state mutation.
