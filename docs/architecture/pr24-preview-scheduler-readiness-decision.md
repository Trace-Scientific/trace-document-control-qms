# PR 24 — Preview Scheduler Readiness Decision

Baseline: `main` at `02f20a20e6e7d8e96c4e6125c2392f9efcd708bc`

## Decision

Activate the already-reviewed PR 23 Twilio delivery-status scheduler contract in the existing Railway development preview before expanding another provider callback family.

The activation remains a preview-only operational exercise. It does not qualify the scheduler for protected validation or production use, and it does not create protected AWS resources.

## Why this slice comes next

PRs 20–23 established a complete Twilio callback/reconciliation/monitoring chain:

- signed status callbacks;
- callback-driven reconciliation;
- missed-callback status polling;
- scheduler lease/heartbeat/alert semantics.

The remaining gap is deployment ownership of the recurring invocation. The existing Railway preview already has a documented pattern for separate 15-minute cron services using `APP_BASE_URL` and `CRON_SECRET`, so the smallest controlled next step is to make the Twilio monitor deployable through that same preview pattern.

Adding another provider callback family before exercising the completed Twilio chain would leave the current scheduler contract unowned in any active environment and would expand the integration surface before its operational controls are exercised.

## Included

- one-shot `scripts/run-twilio-delivery-monitoring.mjs` runner;
- HTTPS-only application target validation;
- shared `CRON_SECRET` machine authentication;
- redirect refusal to prevent bearer forwarding;
- dedicated preview activation runbook;
- existing Railway preview runbook cross-reference;
- regression tests for the runner and deployment guardrails.

## Not included

- no Railway API mutation or automatic service provisioning;
- no `.railway/railway.ts` cron resource addition;
- no protected AWS/EventBridge scheduler resource;
- no production or validation hostname;
- no provider credential material in the cron service;
- no outbound SMS send/replay capability;
- no automatic resend based on downstream provider failure;
- no new provider callback family.

## Activation gate

`PLATFORM_SCHEDULER_CONFIGURED=true` must not be set on the preview application until the separate Railway cron service has completed a successful one-time execution against the machine-authenticated endpoint.

This prevents the platform health model from claiming recurring scheduler ownership before an actual scheduler exists.

## Next controlled slice

After PR 24 is merged and the preview cron service has been manually activated and observed successfully, the next review should either:

1. collect preview operational evidence and close any scheduler defects; or
2. begin the next provider-family callback/status hardening slice.

Protected AWS validation/production scheduler provisioning remains a separate future change requiring explicit environment approval and validation evidence.
