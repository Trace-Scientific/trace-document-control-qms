# PR 39 Scope Check — Salesforce CDC Bounded Worker and Flow Control

## Included

- Target Salesforce pending-event window of 10.
- Refill only after durable KEEPALIVE or EVENT checkpoint completion.
- Reject pending flow counts outside 0–10.
- Degrade on flow-control failures.
- Add deterministic active-subscription completion signaling.
- Add one-shot worker runner with 1–300 second bounds and 240-second default.
- Close/release a healthy subscription at one-shot timeout.
- Add tests for refill ordering, window bounds, completion outcomes, timeout shutdown, and no runtime activation.
- Add architecture documentation.

## Explicitly excluded

- No integration-runtime registration.
- No package start command.
- No Railway service or cron activation.
- No automatic reconnect/backoff.
- No record-body mapping.
- No downstream QMS mutation.
- No protected AWS provisioning.

## Acceptance guardrail

The controller must never call `requestMore` before the current response's durable checkpoint has completed, and the one-shot runner must never exceed its configured bounded lifetime or restart itself.
