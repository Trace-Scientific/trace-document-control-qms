# Final Railway synthetic-data smoke and UI readiness review

Review baseline: `ed8481a41961372a6bb50d5af7d8aaeed48ff4f1`

Review date: 2026-09-22

Railway project: `humorous-rejoicing`

Environment: `production` (development preview only)

Primary domain: `trace-document-control-qms-production.up.railway.app`

## Scope boundary

Railway remains a synthetic-data development preview. This review is not AWS validation qualification, regulatory validation evidence, or production-release approval.

## Deployment result

The current controlled `main` auto-deployed to Railway after PR #336 corrected the production-build TypeScript blocker.

Latest deployment state for the current main SHA:

- `trace-document-control-qms` — SUCCESS
- `patient-rejoicing` scheduled monitor — SUCCESS
- `twilio-delivery-status-monitor` — SUCCESS
- `salesforce-cdc-worker` — SUCCESS
- `support-sla-overdue-monitor` — SUCCESS
- PostgreSQL service — SUCCESS

No Railway deployment work remained pending at the final status check.

## Production-build evidence

The prior build failed because the plan-version activation route passed `businessApprovalReason` while its request schema inferred only `{ reason: string }`.

PR #336 corrected that schema mismatch.

For the corrected deployment, the Railway production build:

- compiled successfully;
- completed TypeScript successfully;
- advanced through page-data collection;
- produced and started the application container.

The exact previously failing TypeScript stage is therefore confirmed cleared.

## Database and runtime evidence

The primary application deployment reported:

- Prisma schema loaded successfully;
- 109 migrations discovered;
- the required `20260922070000_plan_pricing_business_approval` migration applied;
- all migrations successfully applied;
- Next.js 16.3.4 started on port 8080;
- application reported `Ready`.

Recent internal HTTP activity on the current deployment returned HTTP 200 for:

- Twilio delivery monitoring;
- support SLA scan; and
- equipment overdue monitoring.

The inspected current deployment logs showed no current 5xx proxy failures.

## Resource signal

At the time of review, the primary QMS service showed low development-preview utilization:

- CPU approximately idle, with low one-hour average;
- memory approximately 0.09 GB current and about 0.21 GB maximum during the sampled hour.

These values are preview observations only and are not production sizing evidence.

## User-facing UI evidence boundary

The public Railway domain is configured and routed to application port 8080.

This execution environment could not independently render the public/login UI because:

1. the general web-fetch layer returned a cache/fetch failure for the domain;
2. the Railway agent read-only browser/check request could not run because the Railway Agent usage limit was reached; and
3. direct container DNS resolution for the Railway domain is unavailable in this environment.

Railway proxy logs confirm the public domain is receiving requests, but that is not equivalent to a complete authenticated visual UI inspection.

Therefore the runtime/deployment portion of the Railway smoke review is **PASS**, while authenticated visual/UI inspection is **manual confirmation pending** before the next immutable release candidate is designated.

## Manual visual confirmation checklist

Using the Railway preview with synthetic data only, confirm:

- login/landing page renders without obvious layout breakage;
- authenticated QMS shell/navigation renders;
- Platform Administration opens for an authorized platform administrator;
- Help/User Manual workspace opens and UM-QMS-001 remains DRAFT/unpublished;
- Subscriptions/commercial administration screens render;
- controlled Support Access workspace renders;
- no obvious clipped navigation, blank major workspace, or unhandled error page is present.

Do not publish the manual/Help baseline or perform AWS validation actions as part of this visual check.

## Release-candidate gate

Do not designate the next immutable release candidate until the manual visual confirmation above is recorded as satisfactory.

Once confirmed:

1. reconcile release identity from `0.1.0-rc.6` to the next candidate in one controlled change;
2. run fresh CI/Security against the exact candidate SHA;
3. retain Railway as preview-only evidence;
4. stop at the explicit AWS cost gate before any APPLY.

## AWS boundary

AWS remains **PLAN-only**.

No AWS APPLY is authorized by this review, and no material AWS infrastructure cost activation has begun.
