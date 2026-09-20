# PR 40 Scope Check — Salesforce CDC Worker Entrypoint Without Activation

## Included

- Add explicit Salesforce CDC worker composition module.
- Compose governed credential resolver + subscriber controller + bounded one-shot runner.
- Require exact `SALESFORCE_CDC_WORKER_ENABLED=true`.
- Support bounded optional `SALESFORCE_CDC_WORKER_MAX_RUN_MS` from 1–300 seconds.
- Add cron-authenticated internal POST route.
- Add standalone HTTPS caller script.
- Reject URL credentials, query parameters, fragments, plaintext HTTP, weak/missing cron secret, and disabled worker state.
- Add explicit npm command.
- Copy the command into the preview runtime image.
- Add tests for activation gating, config bounds, route authentication, caller security, no scheduler, and no default runtime registration.
- Add architecture documentation.

## Explicitly excluded

- No Railway service.
- No Railway cron schedule.
- No application start-command change.
- No automatic execution after merge.
- No reconnect/backoff.
- No record-body mapping.
- No QMS mutation.
- No protected AWS provisioning.

## Acceptance guardrail

The repository may contain a runnable Salesforce CDC one-shot worker command after merge, but no deployed process may execute it automatically and the server-side worker route must remain disabled unless `SALESFORCE_CDC_WORKER_ENABLED` is explicitly set to exactly `true`.
